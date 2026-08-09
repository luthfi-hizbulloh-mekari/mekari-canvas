import { nanoid } from "nanoid";
import { getApiBase } from "@/lib/api-base";
import { getPublisherIdentity } from "@/lib/publisher-session";
import { checkSkillPackage } from "@/lib/skill-package-freshness";
import { StorageMisconfiguredError } from "@/lib/storage-errors";
import { getStorage } from "@/lib/storage";
import { UPLOAD_ID_LENGTH } from "@/lib/trace-staging";

export async function POST(req: Request) {
  const identity = await getPublisherIdentity(req);
  if (!identity) {
    return Response.json(
      { error: "Publisher sign-in or Bearer token required" },
      { status: 401 }
    );
  }

  const verdict = checkSkillPackage({
    via: identity.via,
    version: req.headers.get("x-mekari-canvas-skill-version"),
    breaking: true,
    hasRetiredReplaceSlug: false,
  });
  if (verdict.status === "block") {
    return Response.json(
      { error: verdict.error, code: verdict.code },
      { status: 400 }
    );
  }

  try {
    const uploadId = nanoid(UPLOAD_ID_LENGTH);
    const uploadUrl = await getStorage().createTraceUpload(uploadId, getApiBase(req));
    return Response.json({ uploadId, uploadUrl });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("trace upload URL error:", detail, error);
    return Response.json(
      { error: error instanceof StorageMisconfiguredError ? detail : "Storage unavailable" },
      { status: 503 }
    );
  }
}
