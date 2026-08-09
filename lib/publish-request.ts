import type { TextArtifactKind } from "@/lib/artifact-kind";
import { isUploadId } from "@/lib/trace-staging";
import { validateTitle } from "@/lib/validate";

export type Artifact =
  | { kind: TextArtifactKind; content: string }
  | { kind: "trace"; uploadId: string };

export type PublishRequest =
  | { mode: "create"; artifact: Artifact; title?: string; editToken?: string }
  | {
      mode: "edit";
      slug: string;
      artifact?: Artifact;
      title?: string | null;
      editToken?: string;
    };

type ParseResult =
  | { ok: true; value: PublishRequest }
  | { ok: false; error: string };

function optionalString(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  return typeof value === "string" ? value : null;
}

export function parsePublishRequest(input: unknown): ParseResult {
  if (!input || typeof input !== "object") return { ok: false, error: "Invalid JSON body" };
  const body = input as Record<string, unknown>;
  const editSlug = optionalString(body.editSlug);
  const editToken = optionalString(body.editToken);
  const rawTitle = optionalString(body.title);
  if (editSlug === null || editToken === null || rawTitle === null) {
    return { ok: false, error: "Invalid Edit fields" };
  }

  let title: string | null | undefined;
  if (rawTitle !== undefined) {
    const validation = validateTitle(rawTitle);
    if (!validation.ok) return { ok: false, error: validation.error };
    title = validation.value;
  }

  let artifact: Artifact | undefined;
  if (body.kind === "trace") {
    if (!isUploadId(body.uploadId)) {
      return { ok: false, error: "Trace publish requires a valid uploadId" };
    }
    artifact = { kind: "trace", uploadId: body.uploadId };
  } else if (body.kind === "html" || body.kind === "md") {
    if (typeof body.content !== "string") {
      return { ok: false, error: "Artifact content must be a string" };
    }
    artifact = { kind: body.kind, content: body.content };
  } else if (body.kind !== undefined || body.content !== undefined || body.uploadId !== undefined) {
    return { ok: false, error: "Invalid Artifact kind" };
  }

  const slug = editSlug?.trim();
  if (slug) {
    return {
      ok: true,
      value: {
        mode: "edit",
        slug,
        ...(artifact ? { artifact } : {}),
        ...(title === undefined ? {} : { title }),
        ...(editToken ? { editToken } : {}),
      },
    };
  }
  if (!artifact) return { ok: false, error: "Artifact required to create a Share" };
  return {
    ok: true,
    value: {
      mode: "create",
      artifact,
      ...(title === null || title === undefined ? {} : { title }),
      ...(editToken ? { editToken } : {}),
    },
  };
}
