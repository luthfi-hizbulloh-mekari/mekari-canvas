import { getApiBase } from "@/lib/api-base";
import { getSessionPublisherEmail } from "@/lib/publisher-session";
import { mintSetupCode } from "@/lib/token-store";

export async function POST(req: Request) {
  const publisherEmail = await getSessionPublisherEmail(req);
  if (!publisherEmail) {
    return Response.json({ error: "Publisher sign-in required" }, { status: 401 });
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
