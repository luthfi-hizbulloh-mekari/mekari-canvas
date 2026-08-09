import { getApiBase } from "@/lib/api-base";
import { parsePublishRequest } from "@/lib/publish-request";
import { PublishError, publishShare } from "@/lib/publish-share";
import { getPublisherIdentity } from "@/lib/publisher-session";
import { checkSkillPackage } from "@/lib/skill-package-freshness";
import { StorageMisconfiguredError } from "@/lib/storage-errors";

export async function POST(req: Request) {
  const identity = await getPublisherIdentity(req);
  if (!identity) {
    return Response.json(
      { error: "Publisher sign-in or Bearer token required" },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const fields = body && typeof body === "object"
    ? body as Record<string, unknown>
    : null;
  const verdict = checkSkillPackage({
    via: identity.via,
    version: req.headers.get("x-mekari-canvas-skill-version"),
    breaking: fields !== null && ("editSlug" in fields || fields.kind === "trace"),
    hasRetiredReplaceSlug: fields !== null && "replaceSlug" in fields,
  });
  if (verdict.status === "block") {
    return Response.json(
      { error: verdict.error, code: verdict.code },
      { status: 400 }
    );
  }
  const skillPackageWarning = verdict.status === "warn" ? verdict.warning : undefined;

  const parsed = parsePublishRequest(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  try {
    const result = await publishShare(parsed.value, identity.email);
    return Response.json({
      ...result,
      shortLink: `${getApiBase(req)}/s/${result.slug}`,
      ...(skillPackageWarning ? { skillPackageWarning } : {}),
    });
  } catch (err) {
    if (err instanceof PublishError) {
      return Response.json({ error: err.message, code: err.code }, { status: err.status });
    }
    const detail = err instanceof Error ? err.message : String(err);
    console.error("publish storage error:", detail, err);
    return Response.json(
      { error: err instanceof StorageMisconfiguredError ? detail : "Storage unavailable" },
      { status: 503 }
    );
  }
}
