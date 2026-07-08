import { getStorage, hashToken, type ShareMeta } from "@/lib/storage";

type AuthzOk = { ok: true; meta: ShareMeta };
type AuthzErr = { ok: false; status: 404 | 403; error: string };

export async function authorizeShareMutation(
  slug: string,
  editToken: string | undefined,
  publisherEmail: string
): Promise<AuthzOk | AuthzErr> {
  const storage = getStorage();
  const meta = await storage.getMeta(slug);
  if (!meta) {
    return { ok: false, status: 404, error: "Share not found" };
  }
  if (!editToken || hashToken(editToken) !== meta.editTokenHash) {
    return { ok: false, status: 403, error: "Browser edit token mismatch" };
  }
  if (meta.publishedBy && meta.publishedBy !== publisherEmail) {
    return { ok: false, status: 403, error: "Publisher email mismatch" };
  }
  return { ok: true, meta };
}
