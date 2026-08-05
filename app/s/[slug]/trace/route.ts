import { ARTIFACT_KIND } from "@/lib/artifact-kind";
import { loadLiveShare } from "@/lib/share-lookup";
import { getStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, OPTIONS",
  "access-control-allow-headers": "range",
  "access-control-expose-headers": "content-length, content-type",
  "accept-ranges": "none",
  "cache-control": "no-store",
};

async function traceMeta(slug: string) {
  const meta = await loadLiveShare(slug);
  return meta?.kind === "trace" ? meta : null;
}

async function serve(
  slug: string,
  includeBody: boolean
): Promise<Response> {
  const meta = await traceMeta(slug);
  if (!meta) return new Response("Not found", { status: 404 });
  const stream = await getStorage().open(meta);
  if (!stream) return new Response("Not found", { status: 404 });

  const headers = new Headers({
    ...CORS_HEADERS,
    "content-type": ARTIFACT_KIND.trace.contentType,
  });
  if (!includeBody) {
    await stream.cancel();
    // HEAD reports the authoritative size Canvas recorded, never a read-path length.
    headers.set("content-length", String(meta.size));
  }
  return new Response(includeBody ? stream : null, { headers });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  return serve((await params).slug, true);
}

export async function HEAD(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  return serve((await params).slug, false);
}

export async function OPTIONS(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  if (!(await traceMeta(slug))) return new Response("Not found", { status: 404 });
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
