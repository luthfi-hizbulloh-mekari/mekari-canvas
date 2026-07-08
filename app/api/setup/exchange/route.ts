import { getApiBase } from "@/lib/api-base";
import { exchangeSetupCode } from "@/lib/token-store";

export async function POST(req: Request) {
  let body: { code?: unknown; label?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.code !== "string" || !body.code.trim()) {
    return Response.json({ error: "Setup code required" }, { status: 400 });
  }

  const label = typeof body.label === "string" ? body.label : undefined;

  try {
    const result = await exchangeSetupCode(body.code.trim(), label);
    if (!result) {
      return Response.json({ error: "Invalid or expired setup code" }, { status: 401 });
    }

    const apiBase = getApiBase(req);
    return Response.json({
      token: result.token,
      tokenId: result.tokenId,
      label: result.label,
      apiBase,
      manifestUrl: `${apiBase}/setup/manifest.json`,
      guideUrl: `${apiBase}/setup/guide.md`,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("setup exchange error:", detail, err);
    return Response.json({ error: "Setup exchange unavailable" }, { status: 503 });
  }
}
