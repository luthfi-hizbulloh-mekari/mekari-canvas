import { devBypassEmail } from "@/lib/dev-bypass";
import { getSessionPublisherEmail, MEKARI_SIGN_IN_REQUIRED } from "@/lib/publisher-session";

export async function GET(req: Request) {
  const publisherEmail = await getSessionPublisherEmail(req);
  if (!publisherEmail) {
    return Response.json({ error: MEKARI_SIGN_IN_REQUIRED }, { status: 401 });
  }

  return Response.json({
    email: publisherEmail,
    viaDevBypass: devBypassEmail() !== null,
  });
}
