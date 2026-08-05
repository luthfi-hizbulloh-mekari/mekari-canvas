import { nanoid } from "nanoid";
import { getApiBase } from "@/lib/api-base";
import { getPublisherEmail } from "@/lib/publisher-session";
import { StorageMisconfiguredError } from "@/lib/storage-errors";
import { getStorage } from "@/lib/storage";
import { UPLOAD_ID_LENGTH } from "@/lib/trace-staging";

export async function POST(req: Request) {
  const publisherEmail = await getPublisherEmail(req);
  if (!publisherEmail) {
    return Response.json(
      { error: "Publisher sign-in or Bearer token required" },
      { status: 401 }
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
