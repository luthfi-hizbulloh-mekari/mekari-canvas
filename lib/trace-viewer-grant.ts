import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { authSecret } from "@/lib/auth-secret";

const GRANT_LIFETIME_SECONDS = 600;
const GRANT_PARAM = "grant";

// Domain-separated from the raw secret Better Auth signs cookies with. Derived per call so
// tests can stub BETTER_AUTH_SECRET.
function grantKey(): Buffer {
  return Buffer.from(
    hkdfSync("sha256", authSecret(), "", "mekari-canvas/trace-viewer-grant/v1", 32)
  );
}

function signature(slug: string, exp: number): string {
  return createHmac("sha256", grantKey()).update(`${slug}\n${exp}`).digest("base64url");
}

/** Trace Viewer URL whose remote-trace fetch carries a Trace viewer grant for this slug. */
export function traceViewerUrl(apiBase: string, slug: string, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + GRANT_LIFETIME_SECONDS;
  const grant = `${exp}.${signature(slug, exp)}`;
  const rawUrl = `${apiBase}/s/${encodeURIComponent(slug)}/trace?${GRANT_PARAM}=${grant}`;
  return `https://trace.playwright.dev/?trace=${encodeURIComponent(rawUrl)}`;
}

/** Stateless check: replay within the grant lifetime is accepted by design (ADR-0016). */
export function hasValidTraceViewerGrant(
  requestUrl: string,
  slug: string,
  now = Date.now()
): boolean {
  const grant = new URL(requestUrl).searchParams.get(GRANT_PARAM);
  const match = grant?.match(/^(\d{1,16})\.([A-Za-z0-9_-]+)$/);
  if (!match) return false;

  const exp = Number(match[1]);
  if (!Number.isSafeInteger(exp) || exp <= Math.floor(now / 1000)) return false;

  // Compare the canonical encoding, so no alternate base64url spelling is accepted.
  const presented = Buffer.from(match[2]);
  const expected = Buffer.from(signature(slug, exp));
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}
