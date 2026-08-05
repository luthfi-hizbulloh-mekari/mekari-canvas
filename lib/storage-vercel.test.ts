import { beforeEach, describe, expect, it, vi } from "vitest";

const blob = vi.hoisted(() => ({
  issueSignedToken: vi.fn(),
  presignUrl: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({
  BlobNotFoundError: class BlobNotFoundError extends Error {},
  copy: vi.fn(),
  del: vi.fn(),
  get: vi.fn(),
  head: vi.fn(),
  issueSignedToken: blob.issueSignedToken,
  list: vi.fn(),
  presignUrl: blob.presignUrl,
  put: vi.fn(),
}));

import { ARTIFACT_KIND } from "@/lib/artifact-kind";
import { VercelDriver } from "@/lib/storage-vercel";

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
