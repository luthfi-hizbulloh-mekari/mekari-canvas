import { beforeEach, describe, expect, it, vi } from "vitest";

const blob = vi.hoisted(() => ({
  get: vi.fn(),
  issueSignedToken: vi.fn(),
  presignUrl: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({
  BlobNotFoundError: class BlobNotFoundError extends Error {},
  copy: vi.fn(),
  del: vi.fn(),
  get: blob.get,
  head: vi.fn(),
  issueSignedToken: blob.issueSignedToken,
  list: vi.fn(),
  presignUrl: blob.presignUrl,
  put: vi.fn(),
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
