import { ARTIFACT_KIND } from "@/lib/artifact-kind";
import { getStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const artifact = await getStorage().getArtifact(slug);
  if (artifact === null) {
    return new Response("Not found", { status: 404 });
  }
  // Shares are served raw — no iframe wrapper or Markdown rendering (CONTEXT.md).
  return new Response(artifact.body, {
    headers: {
      "content-type": ARTIFACT_KIND[artifact.meta.kind].contentType,
      "cache-control": "no-store",
    },
  });
}
