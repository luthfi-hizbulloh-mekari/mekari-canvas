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
  putMeta: vi.fn(),
}));

vi.mock("@/lib/share-authz", () => ({
  authorizeShareMutation: mocks.authorizeShareMutation,
}));
vi.mock("@/lib/storage", () => ({
  getStorage: () => ({
    deleteStagedTrace: mocks.deleteStagedTrace,
    commitStagedTrace: mocks.commitStagedTrace,
    putMeta: mocks.putMeta,
  }),
}));
vi.mock("@/lib/trace-staging", () => ({
  InvalidStagedTraceError: class InvalidStagedTraceError extends Error {},
  inspectStagedTrace: mocks.inspectStagedTrace,
}));

import { publishShare } from "@/lib/publish-share";

const traceArtifact = {
  kind: "trace" as const,
  uploadId: "123456789012345678901",
};
const traceRequest = { mode: "create" as const, artifact: traceArtifact };
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
    mocks.putMeta.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("authorizes Edit before reading staged metadata and still cleans up", async () => {
    mocks.authorizeShareMutation.mockResolvedValue({
      ok: false,
      status: 403,
      error: "Publisher email mismatch",
    });

    await expect(
      publishShare(
        { mode: "edit", slug: "abc12345", artifact: traceArtifact },
        publisherEmail
      )
    ).rejects.toMatchObject({ status: 403 });

    expect(mocks.inspectStagedTrace).not.toHaveBeenCalled();
    expect(mocks.deleteStagedTrace).toHaveBeenCalledWith(traceArtifact.uploadId);
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

  it("commits a new small trace with Title and without an expiresAt key", async () => {
    mocks.inspectStagedTrace.mockResolvedValue(TRACE_RETENTION_THRESHOLD_BYTES - 1);

    const result = await publishShare(
      { ...traceRequest, title: "checkout flake trace" },
      publisherEmail
    );

    expect(result.expiresAt).toBeNull();
    expect(result.title).toBe("checkout flake trace");
    expect(committedMeta().title).toBe("checkout flake trace");
    expect(committedMeta()).not.toHaveProperty("expiresAt");
  });

  it("commits a new large trace with an expiration exactly 168 hours from now", async () => {
    mocks.inspectStagedTrace.mockResolvedValue(TRACE_RETENTION_THRESHOLD_BYTES);

    const result = await publishShare(traceRequest, publisherEmail);
    const expiresAt = new Date(Date.parse(now) + TRACE_RETENTION_DURATION_MS).toISOString();

    expect(result.expiresAt).toBe(expiresAt);
    expect(committedMeta().expiresAt).toBe(expiresAt);
  });

  it("preserves a legacy deadline on a same-class small Edit", async () => {
    const legacyDeadline = "2026-08-31T00:00:00.000Z";
    mocks.authorizeShareMutation.mockResolvedValue({
      ok: true,
      meta: previous({ expiresAt: legacyDeadline }),
    });
    mocks.inspectStagedTrace.mockResolvedValue(TRACE_RETENTION_THRESHOLD_BYTES - 2);

    await publishShare(
      { mode: "edit", slug: "abc12345", artifact: traceArtifact },
      publisherEmail
    );

    expect(committedMeta().expiresAt).toBe(legacyDeadline);
  });

  it("clears expiration and the stored key on a large-to-small Edit", async () => {
    mocks.authorizeShareMutation.mockResolvedValue({
      ok: true,
      meta: previous({
        size: TRACE_RETENTION_THRESHOLD_BYTES,
        expiresAt: "2026-08-10T00:00:00.000Z",
      }),
    });
    mocks.inspectStagedTrace.mockResolvedValue(TRACE_RETENTION_THRESHOLD_BYTES - 1);

    const result = await publishShare(
      { mode: "edit", slug: "abc12345", artifact: traceArtifact },
      publisherEmail
    );

    expect(result.expiresAt).toBeNull();
    expect(committedMeta()).not.toHaveProperty("expiresAt");
  });

  it("sets seven days from the overwrite commit on a small-to-large Edit", async () => {
    mocks.authorizeShareMutation.mockResolvedValue({ ok: true, meta: previous() });
    mocks.inspectStagedTrace.mockResolvedValue(TRACE_RETENTION_THRESHOLD_BYTES);

    await publishShare(
      { mode: "edit", slug: "abc12345", artifact: traceArtifact },
      publisherEmail
    );

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
      publishShare(
        { mode: "edit", slug: "abc12345", artifact: traceArtifact },
        publisherEmail
      )
    ).rejects.toMatchObject({ status: 422, code: "invalid_share_metadata" });

    expect(mocks.inspectStagedTrace).not.toHaveBeenCalled();
    expect(mocks.commitStagedTrace).not.toHaveBeenCalled();
    expect(mocks.deleteStagedTrace).toHaveBeenCalledWith(traceArtifact.uploadId);
  });

  it.each([
    [undefined, "Existing Title"],
    [null, undefined],
    ["New Title", "New Title"],
  ] as const)("applies the Title tri-state while overwriting an Artifact", async (title, expected) => {
    mocks.authorizeShareMutation.mockResolvedValue({
      ok: true,
      meta: previous({ title: "Existing Title" }),
    });
    mocks.inspectStagedTrace.mockResolvedValue(TRACE_RETENTION_THRESHOLD_BYTES - 1);

    await publishShare(
      {
        mode: "edit",
        slug: "abc12345",
        artifact: traceArtifact,
        ...(title === undefined ? {} : { title }),
      },
      publisherEmail
    );

    expect(committedMeta().title).toBe(expected);
  });

  it.each([
    [undefined, "Existing Title"],
    [null, undefined],
    ["New Title", "New Title"],
  ] as const)("applies the Title tri-state without touching the Artifact", async (title, expected) => {
    const existing = previous({
      title: "Existing Title",
      blobPath: "abc12345/old.zip",
      expiresAt: "2026-08-31T00:00:00.000Z",
    });
    mocks.authorizeShareMutation.mockResolvedValue({ ok: true, meta: existing });

    const result = await publishShare(
      {
        mode: "edit",
        slug: "abc12345",
        ...(title === undefined ? {} : { title }),
      },
      publisherEmail
    );

    expect(result).toMatchObject({ edited: true, title: expected });
    const stored = mocks.putMeta.mock.calls[0][0] as ShareMeta;
    expect(stored.title).toBe(expected);
    expect({ ...stored, title: undefined }).toEqual({ ...existing, title: undefined });
    expect(mocks.inspectStagedTrace).not.toHaveBeenCalled();
    expect(mocks.commitStagedTrace).not.toHaveBeenCalled();
    expect(mocks.deleteStagedTrace).not.toHaveBeenCalled();
  });

  it("does not validate stored trace size during a Title-only Edit", async () => {
    const existing = previous({
      title: "Old Title",
      size: Number.NaN,
      expiresAt: "2026-08-31T00:00:00.000Z",
    });
    mocks.authorizeShareMutation.mockResolvedValue({ ok: true, meta: existing });

    await expect(
      publishShare(
        { mode: "edit", slug: "abc12345", title: "New Title" },
        publisherEmail
      )
    ).resolves.toMatchObject({ title: "New Title" });

    expect(mocks.putMeta).toHaveBeenCalledWith({ ...existing, title: "New Title" });
    expect(mocks.inspectStagedTrace).not.toHaveBeenCalled();
  });
});
