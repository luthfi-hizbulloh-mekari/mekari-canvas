import { getApiBase } from "@/lib/api-base";
import { parsePublishRequest } from "@/lib/publish-request";
import { PublishError, publishShare } from "@/lib/publish-share";
import { getPublisherEmail } from "@/lib/publisher-session";
import { StorageMisconfiguredError } from "@/lib/storage-errors";

export async function POST(req: Request) {
  const publisherEmail = await getPublisherEmail(req);
  if (!publisherEmail) {
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

  const parsed = parsePublishRequest(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  try {
    const result = await publishShare(parsed.value, publisherEmail);
    return Response.json({
      ...result,
      shortLink: `${getApiBase(req)}/s/${result.slug}`,
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
