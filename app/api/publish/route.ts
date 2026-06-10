import { nanoid } from "nanoid";
import { getStorage, hashToken } from "@/lib/storage";
import { checkUploadGate, validateArtifact } from "@/lib/validate";

export async function POST(req: Request) {
  if (!checkUploadGate(req)) {
    return Response.json({ error: "Upload gate rejected" }, { status: 401 });
  }

  let body: { html?: string; replaceSlug?: string; editToken?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const html = body.html ?? "";
  const invalid = validateArtifact(html);
  if (invalid) {
    return Response.json({ error: invalid }, { status: 422 });
  }

  const storage = getStorage();
  const now = new Date().toISOString();
  const size = Buffer.byteLength(html, "utf8");

  if (body.replaceSlug) {
    const meta = await storage.getMeta(body.replaceSlug);
    if (!meta) {
      return Response.json({ error: "Share not found" }, { status: 404 });
    }
    if (!body.editToken || hashToken(body.editToken) !== meta.editTokenHash) {
      return Response.json({ error: "Browser edit token mismatch" }, { status: 403 });
    }
    await storage.put({ ...meta, size, updatedAt: now }, html);
    return Response.json({ slug: meta.slug, replaced: true });
  }

  const slug = nanoid(8);
  const editToken = nanoid(32);
  await storage.put(
    { slug, editTokenHash: hashToken(editToken), createdAt: now, updatedAt: now, size },
    html
  );
  return Response.json({ slug, editToken, replaced: false });
}
