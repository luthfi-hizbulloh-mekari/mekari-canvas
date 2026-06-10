import { getStorage } from "@/lib/storage";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const html = await getStorage().getArtifact(slug);
  if (html === null) {
    return new Response("Not found", { status: 404 });
  }
  // Shares are served as raw HTML — no iframe wrapper (CONTEXT.md).
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=60",
    },
  });
}
