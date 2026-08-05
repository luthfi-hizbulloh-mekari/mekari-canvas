import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getStorage: vi.fn(),
  loadLiveShare: vi.fn(),
  open: vi.fn(),
}));

vi.mock("@/lib/share-lookup", () => ({
  loadLiveShare: mocks.loadLiveShare,
}));
vi.mock("@/lib/storage", () => ({
  getStorage: mocks.getStorage,
}));

import { GET } from "@/app/s/[slug]/route";
import { ARTIFACT_KIND, type ArtifactKind } from "@/lib/artifact-kind";
import type { ShareMeta } from "@/lib/storage";

const slug = "abc12345";
const now = "2026-08-05T00:00:00.000Z";

function meta(kind: ArtifactKind, size = 123): ShareMeta {
  return {
    slug,
    kind,
    editTokenHash: "",
    createdAt: now,
    updatedAt: now,
    size,
  };
}

function request(): Request {
  return new Request(`https://canvas.example/s/${slug}`);
}

describe("Share artifact GET", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getStorage.mockReturnValue({ open: mocks.open });
  });

  it.each([
    ["html", "<!doctype html><p>Canvas</p>"],
    ["md", "# Canvas\n"],
  ] as const)("streams a non-empty %s Share without a declared length", async (kind, body) => {
    mocks.loadLiveShare.mockResolvedValue(meta(kind));
    mocks.open.mockResolvedValue(new Blob([body]).stream());

    const response = await GET(request(), { params: Promise.resolve({ slug }) });

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe(body);
    expect(response.headers.get("content-length")).toBeNull();
    expect(response.headers.get("content-type")).toBe(ARTIFACT_KIND[kind].contentType);
  });

  it("redirects Trace Shares to the Playwright viewer", async () => {
    mocks.loadLiveShare.mockResolvedValue(meta("trace"));

    const response = await GET(request(), { params: Promise.resolve({ slug }) });

    const rawUrl = `https://canvas.example/s/${slug}/trace`;
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      `https://trace.playwright.dev/?trace=${encodeURIComponent(rawUrl)}`
    );
    expect(mocks.open).not.toHaveBeenCalled();
  });

  it.each(["missing", "expired"])("returns 404 for a %s Share", async () => {
    mocks.loadLiveShare.mockResolvedValue(null);

    const response = await GET(request(), { params: Promise.resolve({ slug }) });

    expect(response.status).toBe(404);
    expect(mocks.open).not.toHaveBeenCalled();
  });
});
