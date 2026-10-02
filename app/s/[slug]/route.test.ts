import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
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

import { GET } from "@/app/s/[slug]/route";
import { ARTIFACT_KIND, type ArtifactKind } from "@/lib/artifact-kind";
import type { ShareMeta } from "@/lib/storage";
import { hasValidTraceViewerGrant } from "@/lib/trace-viewer-grant";

const slug = "abc12345";
const now = "2026-08-05T00:00:00.000Z";
const BROWSER_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
const ARTIFACT_SANDBOX =
  "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads";

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

function request(headers: Record<string, string> = {}, requestSlug = slug): Request {
  return new Request(`https://canvas.example/s/${requestSlug}`, { headers });
}

function get(req: Request, requestSlug = slug) {
  return GET(req, { params: Promise.resolve({ slug: requestSlug }) });
}

describe("Share artifact GET", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getStorage.mockReturnValue({ open: mocks.open });
    mocks.getPublisherIdentity.mockResolvedValue({ email: "viewer@mekari.com", via: "session" });
  });

  it.each([
    ["html", "<!doctype html><p>Canvas</p>"],
    ["md", "# Canvas\n"],
  ] as const)("streams a non-empty %s Share without a declared length", async (kind, body) => {
    mocks.loadLiveShare.mockResolvedValue(meta(kind));
    mocks.open.mockResolvedValue(new Blob([body]).stream());

    const response = await get(request());

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe(body);
    expect(response.headers.get("content-length")).toBeNull();
    expect(response.headers.get("content-type")).toBe(ARTIFACT_KIND[kind].contentType);
  });

  it.each([
    ["html", "session"],
    ["md", "token"],
  ] as const)("sandboxes a %s Share for a %s Viewer", async (kind, via) => {
    mocks.getPublisherIdentity.mockResolvedValue({ email: "viewer@mekari.com", via });
    mocks.loadLiveShare.mockResolvedValue(meta(kind));
    mocks.open.mockResolvedValue(new Blob(["body"]).stream());

    const response = await get(request());

    const csp = response.headers.get("content-security-policy");
    expect(csp).toBe(ARTIFACT_SANDBOX);
    expect(csp).not.toContain("allow-same-origin");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("redirects Trace Shares to the Playwright viewer with a Trace viewer grant", async () => {
    mocks.loadLiveShare.mockResolvedValue(meta("trace"));

    const response = await get(request());

    expect(response.status).toBe(302);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.origin).toBe("https://trace.playwright.dev");
    const rawUrl = location.searchParams.get("trace") ?? "";
    expect(rawUrl.startsWith(`https://canvas.example/s/${slug}/trace?grant=`)).toBe(true);
    expect(hasValidTraceViewerGrant(rawUrl, slug)).toBe(true);
    expect(mocks.open).not.toHaveBeenCalled();
  });

  it.each(["missing", "expired"])("returns 404 for a %s Share", async () => {
    mocks.loadLiveShare.mockResolvedValue(null);

    const response = await get(request());

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.open).not.toHaveBeenCalled();
  });

  it("returns a no-store 404 when the stored body is missing", async () => {
    mocks.loadLiveShare.mockResolvedValue(meta("html"));
    mocks.open.mockResolvedValue(null);

    const response = await get(request());

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("Share artifact GET without a Viewer", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getStorage.mockReturnValue({ open: mocks.open });
    mocks.getPublisherIdentity.mockResolvedValue(null);
    mocks.loadLiveShare.mockResolvedValue(meta("html"));
  });

  async function expectSignInRequired(response: Response) {
    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("www-authenticate")).toBe('Bearer realm="Mekari Canvas"');
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.text();
    expect(body).toContain("/mekari-canvas read");
    expect(body).toContain("npx skills update");
    expect(body).toContain("https://canvas.example");
    expect(mocks.loadLiveShare).not.toHaveBeenCalled();
  }

  it.each([
    ["a navigation", { "sec-fetch-mode": "navigate", accept: BROWSER_ACCEPT }],
    ["an HTML request without Fetch Metadata", { accept: BROWSER_ACCEPT }],
  ])("redirects %s to sign-in and back to the Short link", async (_label, headers) => {
    const response = await get(request(headers));

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/sign-in?callbackURL=%2Fs%2Fabc12345");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.loadLiveShare).not.toHaveBeenCalled();
  });

  it.each([
    ["Accept */*", { accept: "*/*" }],
    ["no Accept header", {}],
    ["a cors fetch accepting HTML", { "sec-fetch-mode": "cors", accept: BROWSER_ACCEPT }],
    ["a no-cors subresource", { "sec-fetch-mode": "no-cors", accept: BROWSER_ACCEPT }],
  ])("returns a plain-text 401 for %s", async (_label, headers) => {
    await expectSignInRequired(await get(request(headers)));
  });

  it.each([
    ["an invalid Bearer token", "Bearer bad"],
    ["another scheme", "Basic dXNlcjpwYXNz"],
  ])("returns 401 rather than a redirect for %s", async (_label, authorization) => {
    const response = await get(
      request({ authorization, "sec-fetch-mode": "navigate", accept: BROWSER_ACCEPT })
    );

    await expectSignInRequired(response);
  });

  it("answers a missing slug exactly like a live one", async () => {
    const live = await get(request({ accept: "*/*" }));
    mocks.loadLiveShare.mockResolvedValue(null);
    const missing = await get(request({ accept: "*/*" }, "missing1"), "missing1");

    expect(missing.status).toBe(live.status);
    expect([...missing.headers]).toEqual([...live.headers]);
    await expect(missing.text()).resolves.toBe(await live.text());
    expect(mocks.loadLiveShare).not.toHaveBeenCalled();
  });

  it("redirects to a bare sign-in page for a slug outside the Slug alphabet", async () => {
    const response = await get(request({ "sec-fetch-mode": "navigate" }, "a.b"), "a.b");

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/sign-in");
  });
});
