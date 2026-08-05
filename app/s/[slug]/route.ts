import { ARTIFACT_KIND } from "@/lib/artifact-kind";
import { getApiBase } from "@/lib/api-base";
import { loadLiveShare } from "@/lib/share-lookup";
import { getStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const meta = await loadLiveShare(slug);
  if (!meta) return new Response("Not found", { status: 404 });

  if (meta.kind === "trace") {
    const rawUrl = `${getApiBase(req)}/s/${slug}/trace`;
    const viewerUrl = `https://trace.playwright.dev/?trace=${encodeURIComponent(rawUrl)}`;
    return new Response(null, {
      status: 302,
      headers: { location: viewerUrl, "cache-control": "no-store" },
    });
  }

  const artifact = await getStorage().open(meta);
  if (artifact === null) {
    return new Response("Not found", { status: 404 });
  }
  // Shares are served raw — no iframe wrapper or Markdown rendering (CONTEXT.md).
  return new Response(artifact.stream, {
    headers: {
      "content-type": ARTIFACT_KIND[meta.kind].contentType,
      "content-length": String(artifact.size),
      "cache-control": "no-store",
    },
  });
}
