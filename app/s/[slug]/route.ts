import { getStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";

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
      "cache-control": "no-store",
    },
  });
}
