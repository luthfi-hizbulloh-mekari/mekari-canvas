import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShareMeta } from "@/lib/storage";
import {
  TRACE_RETENTION_DURATION_MS,
  TRACE_RETENTION_THRESHOLD_BYTES,
} from "@/lib/trace-expiry";

const mocks = vi.hoisted(() => ({
  authorizeShareMutation: vi.fn(),
  deleteStagedTrace: vi.fn(),
  inspectStagedTrace: vi.fn(),
  commitStagedTrace: vi.fn(),
}));

vi.mock("@/lib/share-authz", () => ({
  authorizeShareMutation: mocks.authorizeShareMutation,
}));
vi.mock("@/lib/storage", () => ({
  getStorage: () => ({
    deleteStagedTrace: mocks.deleteStagedTrace,
    commitStagedTrace: mocks.commitStagedTrace,
  }),
}));
vi.mock("@/lib/trace-staging", () => ({
  InvalidStagedTraceError: class InvalidStagedTraceError extends Error {},
  inspectStagedTrace: mocks.inspectStagedTrace,
}));

import { publishShare } from "@/lib/publish-share";

const traceRequest = {
  kind: "trace" as const,
  uploadId: "123456789012345678901",
};
const publisherEmail = "publisher@mekari.com";
const now = "2026-08-05T00:00:00.000Z";

function previous(overrides: Partial<ShareMeta> = {}): ShareMeta {
  return {
    slug: "abc12345",
    kind: "trace",
    editTokenHash: "existing-hash",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-02T00:00:00.000Z",
    size: TRACE_RETENTION_THRESHOLD_BYTES - 1,
    publishedBy: publisherEmail,
    ...overrides,
  };
}

function committedMeta(): ShareMeta {
  return mocks.commitStagedTrace.mock.calls[0][0] as ShareMeta;
}

describe("publishShare trace retention", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.resetAllMocks();
    mocks.deleteStagedTrace.mockResolvedValue(undefined);
    mocks.commitStagedTrace.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
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
        publisherEmail
      )
    ).rejects.toMatchObject({ status: 403 });

    expect(mocks.inspectStagedTrace).not.toHaveBeenCalled();
    expect(mocks.deleteStagedTrace).toHaveBeenCalledWith(traceRequest.uploadId);
  });

  it("uses the same cleanup path after validation fails", async () => {
    const { InvalidStagedTraceError } = await import("@/lib/trace-staging");
    mocks.inspectStagedTrace.mockRejectedValue(
      new InvalidStagedTraceError("ZIP is not a recognized Playwright trace")
    );

    await expect(
      publishShare(traceRequest, publisherEmail)
    ).rejects.toMatchObject({ status: 422, code: "invalid_artifact" });

    expect(mocks.deleteStagedTrace).toHaveBeenCalledTimes(1);
    expect(mocks.commitStagedTrace).not.toHaveBeenCalled();
  });

  it("commits a new small trace without an expiresAt key", async () => {
    mocks.inspectStagedTrace.mockResolvedValue(TRACE_RETENTION_THRESHOLD_BYTES - 1);

    const result = await publishShare(traceRequest, publisherEmail);

    expect(result.expiresAt).toBeNull();
    expect(committedMeta()).not.toHaveProperty("expiresAt");
  });

  it("commits a new large trace with an expiration exactly 168 hours from now", async () => {
    mocks.inspectStagedTrace.mockResolvedValue(TRACE_RETENTION_THRESHOLD_BYTES);

    const result = await publishShare(traceRequest, publisherEmail);
    const expiresAt = new Date(Date.parse(now) + TRACE_RETENTION_DURATION_MS).toISOString();

    expect(result.expiresAt).toBe(expiresAt);
    expect(committedMeta().expiresAt).toBe(expiresAt);
  });

  it("preserves a legacy deadline on a same-class small replacement", async () => {
    const legacyDeadline = "2026-08-31T00:00:00.000Z";
    mocks.authorizeShareMutation.mockResolvedValue({
      ok: true,
      meta: previous({ expiresAt: legacyDeadline }),
    });
    mocks.inspectStagedTrace.mockResolvedValue(TRACE_RETENTION_THRESHOLD_BYTES - 2);

    await publishShare({ ...traceRequest, replaceSlug: "abc12345" }, publisherEmail);

    expect(committedMeta().expiresAt).toBe(legacyDeadline);
  });

  it("clears expiration and the stored key on a large-to-small replacement", async () => {
    mocks.authorizeShareMutation.mockResolvedValue({
      ok: true,
      meta: previous({
        size: TRACE_RETENTION_THRESHOLD_BYTES,
        expiresAt: "2026-08-10T00:00:00.000Z",
      }),
    });
    mocks.inspectStagedTrace.mockResolvedValue(TRACE_RETENTION_THRESHOLD_BYTES - 1);

    const result = await publishShare(
      { ...traceRequest, replaceSlug: "abc12345" },
      publisherEmail
    );

    expect(result.expiresAt).toBeNull();
    expect(committedMeta()).not.toHaveProperty("expiresAt");
  });

  it("sets seven days from replacement commit on a small-to-large replacement", async () => {
    mocks.authorizeShareMutation.mockResolvedValue({ ok: true, meta: previous() });
    mocks.inspectStagedTrace.mockResolvedValue(TRACE_RETENTION_THRESHOLD_BYTES);

    await publishShare({ ...traceRequest, replaceSlug: "abc12345" }, publisherEmail);

    expect(committedMeta().expiresAt).toBe(
      new Date(Date.parse(now) + TRACE_RETENTION_DURATION_MS).toISOString()
    );
    expect(committedMeta().updatedAt).toBe(now);
  });

  it("rejects invalid old size before staged reads and still cleans up", async () => {
    mocks.authorizeShareMutation.mockResolvedValue({
      ok: true,
      meta: previous({ size: Number.NaN }),
    });

    await expect(
      publishShare({ ...traceRequest, replaceSlug: "abc12345" }, publisherEmail)
    ).rejects.toMatchObject({ status: 422, code: "invalid_share_metadata" });

    expect(mocks.inspectStagedTrace).not.toHaveBeenCalled();
    expect(mocks.commitStagedTrace).not.toHaveBeenCalled();
    expect(mocks.deleteStagedTrace).toHaveBeenCalledWith(traceRequest.uploadId);
  });
});
