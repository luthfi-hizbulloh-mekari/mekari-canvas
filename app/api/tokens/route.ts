import { getSessionPublisherEmail } from "@/lib/publisher-session";
import { listPublisherTokens } from "@/lib/token-store";

export async function GET(req: Request) {
  const publisherEmail = await getSessionPublisherEmail(req);
  if (!publisherEmail) {
    return Response.json({ error: "Publisher sign-in required" }, { status: 401 });
  }

  try {
    const tokens = await listPublisherTokens(publisherEmail);
    return Response.json({ tokens });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("list tokens error:", detail, err);
    return Response.json({ error: "Token store unavailable" }, { status: 503 });
  }
}
