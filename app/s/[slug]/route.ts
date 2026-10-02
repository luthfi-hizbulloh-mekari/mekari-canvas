import { ARTIFACT_KIND } from "@/lib/artifact-kind";
import { getApiBase } from "@/lib/api-base";
import { loadLiveShare } from "@/lib/share-lookup";
import { getStorage } from "@/lib/storage";
import { traceViewerUrl } from "@/lib/trace-viewer-grant";
import { viewerDenial } from "@/lib/viewer-access";

export const dynamic = "force-dynamic";

// Opaque origin: Artifact scripts cannot call Canvas APIs as the Viewer (ADR-0016).
const ARTIFACT_SANDBOX =
  "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads";

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const denied = await viewerDenial(req, slug);
  if (denied) return denied;

  const meta = await loadLiveShare(slug);
  if (!meta) return notFound();

  if (meta.kind === "trace") {
    // no-store: the location carries a Trace viewer grant.
    return new Response(null, {
      status: 302,
      headers: { location: traceViewerUrl(getApiBase(req), slug), "cache-control": "no-store" },
    });
  }

  const stream = await getStorage().open(meta);
  if (stream === null) return notFound();
  // Shares are served raw — no iframe wrapper or Markdown rendering (CONTEXT.md).
  return new Response(stream, {
    headers: {
      "content-type": ARTIFACT_KIND[meta.kind].contentType,
      "content-security-policy": ARTIFACT_SANDBOX,
      "x-content-type-options": "nosniff",
      "cache-control": "no-store",
    },
  });
}
