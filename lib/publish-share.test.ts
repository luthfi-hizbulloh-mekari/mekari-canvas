import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeShareMutation: vi.fn(),
  deleteStagedTrace: vi.fn(),
  stagedTraceSize: vi.fn(),
  readStagedTraceRange: vi.fn(),
  commitStagedTrace: vi.fn(),
}));

vi.mock("@/lib/share-authz", () => ({
  authorizeShareMutation: mocks.authorizeShareMutation,
}));
vi.mock("@/lib/storage", () => ({
  getStorage: () => ({
    deleteStagedTrace: mocks.deleteStagedTrace,
    stagedTraceSize: mocks.stagedTraceSize,
    readStagedTraceRange: mocks.readStagedTraceRange,
    commitStagedTrace: mocks.commitStagedTrace,
  }),
}));

import { publishShare } from "@/lib/publish-share";

const traceRequest = {
  kind: "trace" as const,
  uploadId: "123456789012345678901",
};

describe("publishShare staged trace lifecycle", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.deleteStagedTrace.mockResolvedValue(undefined);
  });

  it("authorizes Replace before reading staged metadata and still cleans up", async () => {
    mocks.authorizeShareMutation.mockResolvedValue({
      ok: false,
      status: 403,
      error: "Publisher email mismatch",
    });

    await expect(
      publishShare(
        { ...traceRequest, replaceSlug: "abc12345" },
        "publisher@mekari.com"
      )
    ).rejects.toMatchObject({ status: 403 });

    expect(mocks.stagedTraceSize).not.toHaveBeenCalled();
    expect(mocks.deleteStagedTrace).toHaveBeenCalledWith(traceRequest.uploadId);
  });

  it("uses the same cleanup path after validation fails", async () => {
    mocks.stagedTraceSize.mockResolvedValue(3);

    await expect(
      publishShare(traceRequest, "publisher@mekari.com")
    ).rejects.toMatchObject({ status: 422 });

    expect(mocks.deleteStagedTrace).toHaveBeenCalledTimes(1);
    expect(mocks.commitStagedTrace).not.toHaveBeenCalled();
  });
});
