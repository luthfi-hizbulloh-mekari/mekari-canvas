import { getStorage, type ShareMeta } from "@/lib/storage";
import { isExpired } from "@/lib/trace-expiry";

export { isExpired } from "@/lib/trace-expiry";

export async function loadLiveShare(slug: string): Promise<ShareMeta | null> {
  const meta = await getStorage().getMeta(slug);
  return meta && !isExpired(meta) ? meta : null;
}
