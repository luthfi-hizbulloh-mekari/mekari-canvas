import { getPublisherEmail } from "@/lib/publisher-session";
import { getStorage } from "@/lib/storage";

export async function GET(req: Request) {
  const publisherEmail = await getPublisherEmail(req);
  if (!publisherEmail) {
    return Response.json({ error: "Publisher sign-in or Bearer token required" }, { status: 401 });
  }

  try {
    const storage = getStorage();
    const shares = await storage.listByPublisher(publisherEmail);
    return Response.json({
      shares: shares.map((meta) => ({
        slug: meta.slug,
        kind: meta.kind,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
        size: meta.size,
        publishedBy: meta.publishedBy,
        legacy: !meta.publishedBy,
      })),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("list shares error:", detail, err);
    return Response.json({ error: "Storage unavailable" }, { status: 503 });
  }
}
