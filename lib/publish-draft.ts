import type { Draft } from "@/lib/draft";
import type { ArtifactKind } from "@/lib/artifact-kind";

export type PublishDraftOptions = {
  editSlug?: string;
  editToken?: string;
  title?: string;
};

export type PublishedShare = {
  slug: string;
  kind: ArtifactKind;
  edited: boolean;
  title?: string;
  shortLink: string;
  expiresAt?: string | null;
  editToken?: string;
};

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  return response.json().catch(() => ({}));
}

async function requireOk(response: Response, fallback: string) {
  const data = await responseJson(response);
  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : fallback);
  }
  return data;
}

export async function publishDraft(
  draft: Draft | null,
  options: PublishDraftOptions
): Promise<PublishedShare> {
  const common = {
    editSlug: options.editSlug || undefined,
    editToken: options.editToken,
    title: options.title,
  };
  let body: Record<string, unknown>;

  if (!draft) {
    body = common;
  } else if (draft.kind === "trace") {
    const upload = await requireOk(
      await fetch("/api/trace-uploads", { method: "POST" }),
      "Could not start trace upload"
    );
    if (typeof upload.uploadId !== "string" || typeof upload.uploadUrl !== "string") {
      throw new Error("Invalid trace upload response");
    }
    const put = await fetch(upload.uploadUrl, {
      method: "PUT",
      headers: { "content-type": "application/zip" },
      body: draft.file,
    });
    if (!put.ok) throw new Error("Trace upload failed");
    body = { kind: "trace", uploadId: upload.uploadId, ...common };
  } else {
    body = { kind: draft.kind, content: draft.text, ...common };
  }

  return (await requireOk(
    await fetch("/api/publish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    "Publish failed"
  )) as PublishedShare;
}
