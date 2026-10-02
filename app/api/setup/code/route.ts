import { getApiBase } from "@/lib/api-base";
import { getSessionPublisherEmail, MEKARI_SIGN_IN_REQUIRED } from "@/lib/publisher-session";
import { mintSetupCode } from "@/lib/token-store";

export async function POST(req: Request) {
  const publisherEmail = await getSessionPublisherEmail(req);
  if (!publisherEmail) {
    return Response.json({ error: MEKARI_SIGN_IN_REQUIRED }, { status: 401 });
  }

  try {
    const { code, expiresAt } = await mintSetupCode(publisherEmail);
    const apiBase = getApiBase(req);
    return Response.json({
      code,
      expiresAt,
      manifestUrl: `${apiBase}/setup/manifest.json`,
      guideUrl: `${apiBase}/setup/guide.md`,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("setup code mint error:", detail, err);
    return Response.json({ error: "Setup code unavailable" }, { status: 503 });
  }
}
