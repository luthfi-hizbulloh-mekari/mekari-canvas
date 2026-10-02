import { getApiBase } from "@/lib/api-base";
import { getPublisherIdentity, getTokenPublisherEmail } from "@/lib/publisher-session";
import { signInPathFor } from "@/lib/sign-in-return";
import { viewerSignInRequiredText } from "@/lib/skill-distribution";
import { hasValidTraceViewerGrant } from "@/lib/trace-viewer-grant";

// Viewer policy (ADR-0016). Neither gate looks up the Share, so unauthenticated callers
// cannot tell live, expired, and missing slugs apart.

function viewerRequired(req: Request): Response {
  return new Response(viewerSignInRequiredText(getApiBase(req)), {
    status: 401,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "www-authenticate": 'Bearer realm="Mekari Canvas"',
      "cache-control": "no-store",
    },
  });
}

/** Browser page navigation; the Accept fallback covers browsers without Fetch Metadata. */
function isPageNavigation(req: Request): boolean {
  const mode = req.headers.get("sec-fetch-mode");
  if (mode !== null) return mode === "navigate";
  return req.headers.get("accept")?.includes("text/html") ?? false;
}

/** Short link gate: Mekari sign-in, Publisher API token, or dev bypass. */
export async function viewerDenial(req: Request, slug: string): Promise<Response | null> {
  if (await getPublisherIdentity(req)) return null;

  // A presented-but-rejected Authorization header is an agent: 401, never a sign-in page.
  if (!req.headers.has("authorization") && isPageNavigation(req)) {
    // Relative: BETTER_AUTH_URL may point a preview deployment at production.
    return new Response(null, {
      status: 302,
      headers: { location: signInPathFor(slug), "cache-control": "no-store" },
    });
  }
  return viewerRequired(req);
}

/** Raw trace endpoint gate: Trace viewer grant or Publisher API token only. */
export async function rawTraceDenial(req: Request, slug: string): Promise<Response | null> {
  if (hasValidTraceViewerGrant(req.url, slug)) return null;
  if (await getTokenPublisherEmail(req)) return null;
  return viewerRequired(req);
}
