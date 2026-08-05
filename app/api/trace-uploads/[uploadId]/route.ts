import { getPublisherEmail } from "@/lib/publisher-session";
import {
  DirectTraceUploadUnavailableError,
  StagedTraceAlreadyExistsError,
} from "@/lib/storage-errors";
import { getStorage } from "@/lib/storage";
import { isUploadId } from "@/lib/trace-staging";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ uploadId: string }> }
) {
  const publisherEmail = await getPublisherEmail(req);
  if (!publisherEmail) {
    return Response.json(
      { error: "Publisher sign-in or Bearer token required" },
      { status: 401 }
    );
  }

  const { uploadId } = await params;
  if (!isUploadId(uploadId)) return new Response("Not found", { status: 404 });
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/zip")) {
    return Response.json({ error: "Trace upload must use application/zip" }, { status: 415 });
  }
  if (!req.body) return Response.json({ error: "Trace upload body required" }, { status: 400 });

  try {
    await getStorage().receiveTraceUpload(uploadId, req.body);
    return new Response(null, { status: 201 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (error instanceof DirectTraceUploadUnavailableError) {
      return new Response("Not found", { status: 404 });
    }
    if (error instanceof StagedTraceAlreadyExistsError) {
      return Response.json({ error: detail }, { status: 409 });
    }
    console.error("local trace upload error:", detail, error);
    return Response.json({ error: "Storage unavailable" }, { status: 503 });
  }
}
