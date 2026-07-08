import { getPublisherEmail } from "@/lib/publisher-session";
import { authorizeShareMutation } from "@/lib/share-authz";
import { getStorage } from "@/lib/storage";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const publisherEmail = await getPublisherEmail(req);
  if (!publisherEmail) {
    return Response.json({ error: "Publisher sign-in required" }, { status: 401 });
  }

  const { slug } = await params;
  const editToken = req.headers.get("x-edit-token") ?? undefined;
  const authz = await authorizeShareMutation(slug, editToken, publisherEmail);
  if (!authz.ok) {
    return Response.json({ error: authz.error }, { status: authz.status });
  }

  const storage = getStorage();
  await storage.delete(slug);
  return Response.json({ deleted: true });
}
