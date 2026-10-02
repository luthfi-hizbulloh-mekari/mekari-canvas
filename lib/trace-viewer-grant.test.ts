import { afterEach, describe, expect, it, vi } from "vitest";
import { hasValidTraceViewerGrant, traceViewerUrl } from "@/lib/trace-viewer-grant";

const slug = "abc12345";
const mintedAt = Date.parse("2026-10-02T00:00:00.000Z");

function rawUrl(grantSlug = slug, now = mintedAt): string {
  const viewerUrl = new URL(traceViewerUrl("https://canvas.example", grantSlug, now));
  return viewerUrl.searchParams.get("trace") ?? "";
}

describe("Trace viewer grant", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("round-trips through the Trace Viewer URL", () => {
    const viewerUrl = new URL(traceViewerUrl("https://canvas.example", slug, mintedAt));

    expect(viewerUrl.origin).toBe("https://trace.playwright.dev");
    expect(rawUrl().startsWith(`https://canvas.example/s/${slug}/trace?grant=`)).toBe(true);
    expect(hasValidTraceViewerGrant(rawUrl(), slug, mintedAt)).toBe(true);
  });

  it("expires after about ten minutes", () => {
    const exp = mintedAt + 600_000;

    expect(hasValidTraceViewerGrant(rawUrl(), slug, exp - 1000)).toBe(true);
    expect(hasValidTraceViewerGrant(rawUrl(), slug, exp)).toBe(false);
  });

  it("is bound to its slug", () => {
    expect(hasValidTraceViewerGrant(rawUrl("other123"), slug, mintedAt)).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const url = new URL(rawUrl());
    const [exp, sig] = (url.searchParams.get("grant") ?? "").split(".");
    url.searchParams.set("grant", `${exp}.${sig[0] === "A" ? "B" : "A"}${sig.slice(1)}`);

    expect(hasValidTraceViewerGrant(url.toString(), slug, mintedAt)).toBe(false);
  });

  it("rejects a grant with an extended expiry", () => {
    const url = new URL(rawUrl());
    const [exp, sig] = (url.searchParams.get("grant") ?? "").split(".");
    url.searchParams.set("grant", `${Number(exp) + 3600}.${sig}`);

    expect(hasValidTraceViewerGrant(url.toString(), slug, mintedAt)).toBe(false);
  });

  it("is invalidated by rotating BETTER_AUTH_SECRET", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "first-secret-at-least-32-characters-long");
    const url = rawUrl();
    vi.stubEnv("BETTER_AUTH_SECRET", "second-secret-at-least-32-characters-long");

    expect(hasValidTraceViewerGrant(url, slug, mintedAt)).toBe(false);
  });
});
