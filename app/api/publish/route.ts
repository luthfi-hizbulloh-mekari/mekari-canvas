import { nanoid } from "nanoid";
import { isArtifactKind } from "@/lib/artifact-kind";
import { getStorage, hashToken } from "@/lib/storage";
import { checkUploadGate } from "@/lib/upload-gate";
import { artifactBytes, validateArtifact } from "@/lib/validate";

export async function POST(req: Request) {
  if (!checkUploadGate(req)) {
    return Response.json({ error: "Invalid organization code" }, { status: 401 });
  }

  let body: { content?: unknown; kind?: unknown; replaceSlug?: string; editToken?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isArtifactKind(body.kind)) {
    return Response.json({ error: "Invalid Artifact kind" }, { status: 400 });
  }
  if (typeof body.content !== "string") {
    return Response.json({ error: "Artifact content must be a string" }, { status: 400 });
  }

  const kind = body.kind;
  const content = body.content;
  const replaceSlug = typeof body.replaceSlug === "string" ? body.replaceSlug : "";
  const editToken = typeof body.editToken === "string" ? body.editToken : undefined;
  const invalid = validateArtifact(content, kind);
  if (invalid) {
    return Response.json({ error: invalid }, { status: 422 });
  }

  const now = new Date().toISOString();
  const size = artifactBytes(content);

  try {
    const storage = getStorage();
    if (replaceSlug) {
      const meta = await storage.getMeta(replaceSlug);
      if (!meta) {
        return Response.json({ error: "Share not found" }, { status: 404 });
      }
      if (!editToken || hashToken(editToken) !== meta.editTokenHash) {
        return Response.json({ error: "Browser edit token mismatch" }, { status: 403 });
      }
      if (meta.kind !== kind) {
        return Response.json({ error: "Artifact kind cannot change on Replace" }, { status: 422 });
      }
      await storage.put({ ...meta, size, updatedAt: now }, content);
      return Response.json({ slug: meta.slug, replaced: true, kind });
    }

    const slug = nanoid(8);
    const newEditToken = nanoid(32);
    await storage.put(
      { slug, kind, editTokenHash: hashToken(newEditToken), createdAt: now, updatedAt: now, size },
      content
    );
    return Response.json({ slug, editToken: newEditToken, replaced: false, kind });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("publish storage error:", detail, err);
    return Response.json(
      { error: detail.includes("misconfigured") ? detail : "Storage unavailable" },
      { status: 503 }
    );
  }
}
