import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_ENV_KEYS = [
  "BLOB_READ_WRITE_TOKEN",
  "BLOB_STORE_ID",
  "KV_REST_API_TOKEN",
  "KV_REST_API_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "VERCEL",
] as const;

describe.sequential("LocalDriver compatibility", () => {
  let originalCwd: string;
  let temporaryCwd: string;
  let originalEnv: Partial<Record<(typeof STORAGE_ENV_KEYS)[number], string>>;

  beforeEach(async () => {
    originalCwd = process.cwd();
    temporaryCwd = await mkdtemp(path.join(tmpdir(), "canvas-storage-test-"));
    originalEnv = {};
    for (const key of STORAGE_ENV_KEYS) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
    process.chdir(temporaryCwd);
    vi.resetModules();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    for (const key of STORAGE_ENV_KEYS) {
      const value = originalEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(temporaryCwd, { recursive: true, force: true });
  });

  it.each([
    ["html", "<!doctype html><html><body>still raw</body></html>"],
    ["md", "# Still raw Markdown\n"],
  ] as const)("round-trips existing %s Artifact bytes", async (kind, body) => {
    const { getStorage } = await import("@/lib/storage");
    const storage = getStorage();
    const now = "2026-08-05T00:00:00.000Z";
    const meta = {
      slug: "abc12345",
      kind,
      editTokenHash: "",
      createdAt: now,
      updatedAt: now,
      size: new TextEncoder().encode(body).byteLength,
      publishedBy: "publisher@mekari.com",
    };

    await storage.put(meta, new TextEncoder().encode(body));
    const stored = await storage.getMeta(meta.slug);
    expect(stored).not.toBeNull();
    const artifact = await storage.open(stored!);
    expect(artifact).not.toBeNull();
    await expect(new Response(artifact!.stream).text()).resolves.toBe(body);
  });

  it("publishes each staged upload atomically and refuses overwrite", async () => {
    const { getStorage } = await import("@/lib/storage");
    const storage = getStorage();
    const uploadId = "123456789012345678901";
    const first = Uint8Array.from([1, 2, 3, 4]);

    await storage.receiveTraceUpload(uploadId, new Blob([first]).stream());
    await expect(
      storage.receiveTraceUpload(uploadId, new Blob([Uint8Array.from([9])]).stream())
    ).rejects.toMatchObject({ name: "StagedTraceAlreadyExistsError" });

    expect(await storage.stagedTraceSize(uploadId)).toBe(first.length);
    expect(await storage.readStagedTraceRange(uploadId, 0, first.length - 1)).toEqual(first);
  });
});
