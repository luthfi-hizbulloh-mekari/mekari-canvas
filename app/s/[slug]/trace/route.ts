import { ARTIFACT_KIND } from "@/lib/artifact-kind";
import { loadLiveShare } from "@/lib/share-lookup";
import { getStorage } from "@/lib/storage";
import { rawTraceDenial } from "@/lib/viewer-access";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, OPTIONS",
  "access-control-allow-headers": "range",
  "access-control-expose-headers": "content-length, content-type",
  "accept-ranges": "none",
  "cache-control": "no-store",
};

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
}

async function traceMeta(slug: string) {
  const meta = await loadLiveShare(slug);
  return meta?.kind === "trace" ? meta : null;
}

async function serve(
  slug: string,
  includeBody: boolean
): Promise<Response> {
  const meta = await traceMeta(slug);
  if (!meta) return notFound();
  const stream = await getStorage().open(meta);
  if (!stream) return notFound();

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

async function guardedServe(
  req: Request,
  slug: string,
  includeBody: boolean
): Promise<Response> {
  const denied = await rawTraceDenial(req, slug);
  return denied ?? serve(slug, includeBody);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  return guardedServe(req, (await params).slug, true);
}

export async function HEAD(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  return guardedServe(req, (await params).slug, false);
}

// Preflights carry no credentials, and a Share lookup here would reveal which slugs exist.
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
