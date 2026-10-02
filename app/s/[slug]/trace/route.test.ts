import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cancel: vi.fn(),
  getPublisherIdentity: vi.fn(),
  getStorage: vi.fn(),
  getTokenPublisherEmail: vi.fn(),
  loadLiveShare: vi.fn(),
  open: vi.fn(),
}));

vi.mock("@/lib/publisher-session", () => ({
  getPublisherIdentity: mocks.getPublisherIdentity,
  getTokenPublisherEmail: mocks.getTokenPublisherEmail,
}));
vi.mock("@/lib/share-lookup", () => ({
  loadLiveShare: mocks.loadLiveShare,
}));
vi.mock("@/lib/storage", () => ({
  getStorage: mocks.getStorage,
}));

import { GET, HEAD, OPTIONS } from "@/app/s/[slug]/trace/route";
import { ARTIFACT_KIND } from "@/lib/artifact-kind";
import type { ShareMeta } from "@/lib/storage";
import { traceViewerUrl } from "@/lib/trace-viewer-grant";

const slug = "abc12345";
const traceSize = 4096;
const now = "2026-08-05T00:00:00.000Z";
const traceMeta: ShareMeta = {
  slug,
  kind: "trace",
  editTokenHash: "",
  createdAt: now,
  updatedAt: now,
  size: traceSize,
};
const htmlMeta: ShareMeta = { ...traceMeta, kind: "html" };

function grantedUrl(grantSlug = slug, mintedAt = Date.now()): string {
  const viewerUrl = new URL(traceViewerUrl("https://canvas.example", grantSlug, mintedAt));
  const rawUrl = new URL(viewerUrl.searchParams.get("trace") ?? "");
  // Re-point the grant at the requested slug's endpoint so only the grant itself differs.
  return `https://canvas.example/s/${slug}/trace${rawUrl.search}`;
}

// Flip the first signature character; a trailing base64url character can carry padding bits.
function tamper(url: string): string {
  return url.replace(/(grant=\d+\.)(.)/, (_match, prefix: string, c: string) =>
    `${prefix}${c === "A" ? "B" : "A"}`
  );
}

function request(
  method: "GET" | "HEAD" | "OPTIONS",
  url = grantedUrl(),
  headers: Record<string, string> = {}
): Request {
  return new Request(url, { method, headers });
}

function params() {
  return { params: Promise.resolve({ slug }) };
}

function expectCors(response: Response) {
  expect(response.headers.get("access-control-allow-origin")).toBe("*");
  expect(response.headers.get("access-control-allow-methods")).toBe("GET, HEAD, OPTIONS");
  expect(response.headers.get("access-control-allow-headers")).toBe("range");
  expect(response.headers.get("access-control-allow-credentials")).toBeNull();
  expect(response.headers.get("access-control-expose-headers")).toBe(
    "content-length, content-type"
  );
  expect(response.headers.get("accept-ranges")).toBe("none");
  expect(response.headers.get("cache-control")).toBe("no-store");
}

describe("Trace artifact route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getStorage.mockReturnValue({ open: mocks.open });
    mocks.getTokenPublisherEmail.mockResolvedValue(null);
  });

  it("streams GET bytes without a declared length", async () => {
    const bytes = Uint8Array.from([80, 75, 3, 4, 1, 2, 3]);
    mocks.loadLiveShare.mockResolvedValue(traceMeta);
    mocks.open.mockResolvedValue(new Blob([bytes]).stream());

    const response = await GET(request("GET"), params());

    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(response.headers.get("content-length")).toBeNull();
    expect(response.headers.get("content-type")).toBe(ARTIFACT_KIND.trace.contentType);
    expectCors(response);
  });

  it("reports the Canvas-recorded size and cancels the upstream stream on HEAD", async () => {
    const stream = new ReadableStream<Uint8Array>({ cancel: mocks.cancel });
    mocks.loadLiveShare.mockResolvedValue(traceMeta);
    mocks.open.mockResolvedValue(stream);

    const response = await HEAD(request("HEAD"), params());

    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
    expect(response.headers.get("content-length")).toBe(String(traceSize));
    expect(response.headers.get("content-type")).toBe(ARTIFACT_KIND.trace.contentType);
    expect(mocks.cancel).toHaveBeenCalledOnce();
    expectCors(response);
  });

  it("serves a Publisher API token without a grant", async () => {
    mocks.getTokenPublisherEmail.mockResolvedValue("agent@mekari.com");
    mocks.loadLiveShare.mockResolvedValue(traceMeta);
    mocks.open.mockResolvedValue(new Blob([Uint8Array.from([80, 75])]).stream());

    const response = await GET(
      request("GET", `https://canvas.example/s/${slug}/trace`, {
        authorization: "Bearer publisher-token",
      }),
      params()
    );

    expect(response.status).toBe(200);
  });

  it("answers OPTIONS for any slug with CORS headers and no Share lookup", async () => {
    const response = await OPTIONS();

    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
    expectCors(response);
    expect(mocks.loadLiveShare).not.toHaveBeenCalled();
    expect(mocks.open).not.toHaveBeenCalled();
  });

  it.each([
    ["no grant", `https://canvas.example/s/${slug}/trace`],
    ["grant abc", `https://canvas.example/s/${slug}/trace?grant=abc`],
    ["grant 1.", `https://canvas.example/s/${slug}/trace?grant=1.`],
    ["grant .sig", `https://canvas.example/s/${slug}/trace?grant=.sig`],
    ["a tampered signature", tamper(grantedUrl())],
    ["an expired grant", grantedUrl(slug, Date.now() - 11 * 60 * 1000)],
    ["a grant for another slug", grantedUrl("other123")],
  ])("returns 401 without a Share lookup for %s", async (_label, url) => {
    mocks.loadLiveShare.mockResolvedValue(traceMeta);

    for (const handler of [GET, HEAD]) {
      const response = await handler(request(handler === GET ? "GET" : "HEAD", url), params());

      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(mocks.loadLiveShare).not.toHaveBeenCalled();
  });

  it("returns 401, not 404, for a missing slug without credentials", async () => {
    mocks.loadLiveShare.mockResolvedValue(null);

    const response = await GET(
      request("GET", `https://canvas.example/s/${slug}/trace`),
      params()
    );

    expect(response.status).toBe(401);
    expect(mocks.loadLiveShare).not.toHaveBeenCalled();
  });

  it("ignores the session cookie and dev bypass", async () => {
    mocks.getPublisherIdentity.mockResolvedValue({ email: "viewer@mekari.com", via: "session" });

    const response = await GET(
      request("GET", `https://canvas.example/s/${slug}/trace`),
      params()
    );

    expect(response.status).toBe(401);
  });

  it.each([
    ["GET", GET],
    ["HEAD", HEAD],
  ] as const)("returns 404 for non-trace and expired Shares on %s", async (method, handler) => {
    for (const lookupResult of [htmlMeta, null]) {
      mocks.loadLiveShare.mockResolvedValueOnce(lookupResult);

      const response = await handler(request(method), params());

      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(mocks.open).not.toHaveBeenCalled();
  });

  it.each([
    ["GET", GET],
    ["HEAD", HEAD],
  ] as const)("returns a no-store 404 when the stored trace is missing on %s", async (method, handler) => {
    mocks.loadLiveShare.mockResolvedValue(traceMeta);
    mocks.open.mockResolvedValue(null);

    const response = await handler(request(method), params());

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
