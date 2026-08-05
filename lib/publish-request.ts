import type { TextArtifactKind } from "@/lib/artifact-kind";
import { isUploadId } from "@/lib/trace-staging";

type CommonPublishFields = { replaceSlug?: string; editToken?: string };

export type PublishRequest =
  | ({ kind: TextArtifactKind; content: string } & CommonPublishFields)
  | ({ kind: "trace"; uploadId: string } & CommonPublishFields);

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
  const replaceSlug = optionalString(body.replaceSlug);
  const editToken = optionalString(body.editToken);
  if (replaceSlug === null || editToken === null) {
    return { ok: false, error: "Invalid Replace fields" };
  }

  const common = { replaceSlug, editToken };
  if (body.kind === "trace") {
    if (!isUploadId(body.uploadId)) {
      return { ok: false, error: "Trace publish requires a valid uploadId" };
    }
    return { ok: true, value: { kind: "trace", uploadId: body.uploadId, ...common } };
  }
  if (body.kind === "html" || body.kind === "md") {
    if (typeof body.content !== "string") {
      return { ok: false, error: "Artifact content must be a string" };
    }
    return { ok: true, value: { kind: body.kind, content: body.content, ...common } };
  }
  return { ok: false, error: "Invalid Artifact kind" };
}
