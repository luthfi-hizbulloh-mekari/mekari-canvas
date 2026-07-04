import { getStorage, hashToken } from "@/lib/storage";
import { checkUploadGate } from "@/lib/upload-gate";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!checkUploadGate(req)) {
    return Response.json({ error: "Invalid organization code" }, { status: 401 });
  }
  const { slug } = await params;
  const storage = getStorage();
  const meta = await storage.getMeta(slug);
  if (!meta) {
    return Response.json({ error: "Share not found" }, { status: 404 });
  }
  const editToken = req.headers.get("x-edit-token");
  if (!editToken || hashToken(editToken) !== meta.editTokenHash) {
    return Response.json({ error: "Browser edit token mismatch" }, { status: 403 });
  }
  await storage.delete(slug);
  return Response.json({ deleted: true });
}
