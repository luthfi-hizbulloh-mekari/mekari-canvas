import { getSessionPublisherEmail } from "@/lib/publisher-session";
import { revokePublisherToken } from "@/lib/token-store";

export async function POST(req: Request) {
  const publisherEmail = await getSessionPublisherEmail(req);
  if (!publisherEmail) {
    return Response.json({ error: "Publisher sign-in required" }, { status: 401 });
  }

  let body: { tokenId?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.tokenId !== "string" || !body.tokenId.trim()) {
    return Response.json({ error: "tokenId required" }, { status: 400 });
  }

  try {
    const revoked = await revokePublisherToken(publisherEmail, body.tokenId.trim());
    if (!revoked) {
      return Response.json({ error: "Token not found" }, { status: 404 });
    }
    return Response.json({ revoked: true });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("revoke token error:", detail, err);
    return Response.json({ error: "Token store unavailable" }, { status: 503 });
  }
}
