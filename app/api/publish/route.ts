import { nanoid } from "nanoid";
import { isArtifactKind } from "@/lib/artifact-kind";
import { getPublisherEmail } from "@/lib/publisher-session";
import { authorizeShareMutation } from "@/lib/share-authz";
import { getStorage, hashToken } from "@/lib/storage";
import { artifactBytes, validateArtifact } from "@/lib/validate";

export async function POST(req: Request) {
  const publisherEmail = await getPublisherEmail(req);
  if (!publisherEmail) {
    return Response.json({ error: "Publisher sign-in required" }, { status: 401 });
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
      const authz = await authorizeShareMutation(replaceSlug, editToken, publisherEmail);
      if (!authz.ok) {
        return Response.json({ error: authz.error }, { status: authz.status });
      }
      const { meta } = authz;
      if (meta.kind !== kind) {
        return Response.json({ error: "Artifact kind cannot change on Replace" }, { status: 422 });
      }
      await storage.put({ ...meta, size, updatedAt: now }, content);
      return Response.json({
        slug: meta.slug,
        replaced: true,
        kind,
        publishedBy: meta.publishedBy,
      });
    }

    const slug = nanoid(8);
    const newEditToken = nanoid(32);
    await storage.put(
      {
        slug,
        kind,
        editTokenHash: hashToken(newEditToken),
        createdAt: now,
        updatedAt: now,
        size,
        publishedBy: publisherEmail,
      },
      content
    );
    return Response.json({
      slug,
      editToken: newEditToken,
      replaced: false,
      kind,
      publishedBy: publisherEmail,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("publish storage error:", detail, err);
    return Response.json(
      { error: detail.includes("misconfigured") ? detail : "Storage unavailable" },
      { status: 503 }
    );
  }
}
