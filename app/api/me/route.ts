import { devBypassEmail } from "@/lib/dev-bypass";
import { getSessionPublisherEmail } from "@/lib/publisher-session";

export async function GET(req: Request) {
  const publisherEmail = await getSessionPublisherEmail(req);
  if (!publisherEmail) {
    return Response.json({ error: "Publisher sign-in required" }, { status: 401 });
  }

  return Response.json({
    email: publisherEmail,
    viaDevBypass: devBypassEmail() !== null,
  });
}
