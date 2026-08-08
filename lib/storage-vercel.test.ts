import { beforeEach, describe, expect, it, vi } from "vitest";

const blob = vi.hoisted(() => ({
  copy: vi.fn(),
  get: vi.fn(),
  issueSignedToken: vi.fn(),
  presignUrl: vi.fn(),
}));

const redis = vi.hoisted(() => {
  const transaction = {
    exec: vi.fn(),
    sadd: vi.fn(),
    set: vi.fn(),
    zadd: vi.fn(),
    zrem: vi.fn(),
  };
  return {
    get: vi.fn(),
    multi: vi.fn(),
    transaction,
    zrange: vi.fn(),
    zrem: vi.fn(),
  };
});

vi.mock("@vercel/blob", () => ({
  BlobNotFoundError: class BlobNotFoundError extends Error {},
  copy: blob.copy,
  del: vi.fn(),
  get: blob.get,
  head: vi.fn(),
  issueSignedToken: blob.issueSignedToken,
  list: vi.fn(),
  presignUrl: blob.presignUrl,
  put: vi.fn(),
}));
vi.mock("@/lib/redis", () => ({
  getRedis: () => redis,
}));

import { ARTIFACT_KIND } from "@/lib/artifact-kind";
import type { ShareMeta } from "@/lib/storage";
import { VercelDriver } from "@/lib/storage-vercel";

describe("Vercel artifact reads", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("streams the full artifact when the Blob SDK reports a zero size", async () => {
    const body = "<!doctype html><p>still here</p>";
    const stream = new Blob([body]).stream();
    blob.get.mockResolvedValue({
      statusCode: 200,
      stream,
      headers: new Headers(),
      blob: { size: 0 },
    });
    const meta: ShareMeta = {
      slug: "abc12345",
      kind: "html",
      editTokenHash: "",
      createdAt: "2026-08-05T00:00:00.000Z",
      updatedAt: "2026-08-05T00:00:00.000Z",
      size: new TextEncoder().encode(body).byteLength,
    };

    const artifact = await new VercelDriver().open(meta);

    expect(artifact).not.toBeNull();
    await expect(new Response(artifact).text()).resolves.toBe(body);
  });
});

describe("Vercel staged trace upload", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    blob.issueSignedToken.mockResolvedValue("signed-token");
    blob.presignUrl.mockResolvedValue({ presignedUrl: "https://blob.example/upload" });
  });

  it("issues an immutable, constrained presigned PUT", async () => {
    const uploadId = "123456789012345678901";
    const driver = new VercelDriver();

    await expect(driver.createTraceUpload(uploadId, "http://localhost")).resolves.toBe(
      "https://blob.example/upload"
    );
    expect(blob.presignUrl).toHaveBeenCalledWith(
      "signed-token",
      expect.objectContaining({
        operation: "put",
        pathname: `staging/${uploadId}.zip`,
        access: "private",
        allowOverwrite: false,
        addRandomSuffix: false,
        allowedContentTypes: [ARTIFACT_KIND.trace.contentType],
        maximumSizeInBytes: ARTIFACT_KIND.trace.maxBytes,
      })
    );
  });
});

describe("Vercel trace expiry index", () => {
  const baseMeta: ShareMeta = {
    slug: "abc12345",
    kind: "trace",
    editTokenHash: "",
    createdAt: "2026-08-05T00:00:00.000Z",
    updatedAt: "2026-08-05T00:00:00.000Z",
    size: 999_999,
    publishedBy: "publisher@mekari.com",
  };

  beforeEach(() => {
    vi.resetAllMocks();
    redis.get.mockResolvedValue(null);
    redis.multi.mockReturnValue(redis.transaction);
    redis.transaction.exec.mockResolvedValue([]);
    blob.copy.mockResolvedValue(undefined);
  });

  it("removes a permanent trace from the expiry index in the metadata transaction", async () => {
    await new VercelDriver().commitStagedTrace(baseMeta, "123456789012345678901");

    expect(redis.transaction.set).toHaveBeenCalledWith(
      "canvas:share:abc12345",
      expect.objectContaining({ slug: "abc12345" })
    );
    expect(redis.transaction.zrem).toHaveBeenCalledWith(
      "canvas:trace:expiry",
      "abc12345"
    );
    expect(redis.transaction.zadd).not.toHaveBeenCalled();
    expect(redis.transaction.exec).toHaveBeenCalledOnce();
  });

  it("adds an expiring trace to the expiry index in the metadata transaction", async () => {
    const expiresAt = "2026-08-12T00:00:00.000Z";
    await new VercelDriver().commitStagedTrace(
      { ...baseMeta, size: 1_000_000, expiresAt },
      "123456789012345678901"
    );

    expect(redis.transaction.zadd).toHaveBeenCalledWith("canvas:trace:expiry", {
      score: Date.parse(expiresAt),
      member: "abc12345",
    });
    expect(redis.transaction.zrem).not.toHaveBeenCalled();
    expect(redis.transaction.exec).toHaveBeenCalledOnce();
  });

  it("rechecks metadata before sweeping and removes stale index members", async () => {
    const sweepAt = Date.parse("2026-08-12T00:00:00.000Z");
    redis.zrange.mockResolvedValue(["permanent", "expired"]);
    redis.get.mockImplementation(async (key: string) => {
      const common = {
        kind: "trace" as const,
        editTokenHash: "",
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
        size: 1_000_000,
      };
      if (key.endsWith("permanent")) return { ...common, slug: "permanent" };
      return {
        ...common,
        slug: "expired",
        expiresAt: "2026-08-11T00:00:00.000Z",
      };
    });

    await expect(new VercelDriver().expiredTraceSlugs(sweepAt)).resolves.toEqual([
      "expired",
    ]);
    expect(redis.zrem).toHaveBeenCalledWith("canvas:trace:expiry", "permanent");
  });
});
