import { nanoid } from "nanoid";
import type { PublishRequest } from "@/lib/publish-request";
import { authorizeShareMutation } from "@/lib/share-authz";
import {
  StagedTraceNotFoundError,
} from "@/lib/storage-errors";
import { getStorage, type ShareMeta, type StorageDriver } from "@/lib/storage";
import { traceExpiresAt } from "@/lib/trace-expiry";
import {
  inspectStagedTrace,
  InvalidStagedTraceError,
} from "@/lib/trace-staging";
import { artifactBytes, validateTextArtifact } from "@/lib/validate";

export class PublishError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 422,
    readonly code:
      | "invalid_artifact"
      | "share_not_found"
      | "publisher_forbidden"
      | "staged_trace_not_found"
      | "artifact_kind_mismatch"
  ) {
    super(message);
    this.name = "PublishError";
  }
}

export type PublishResult = {
  slug: string;
  replaced: boolean;
  kind: PublishRequest["kind"];
  publishedBy?: string;
  expiresAt?: string;
};

async function prepareArtifact(
  storage: StorageDriver,
  request: PublishRequest
): Promise<number> {
  if (request.kind !== "trace") {
    const invalid = validateTextArtifact(request.content, request.kind);
    if (invalid) throw new PublishError(invalid, 422, "invalid_artifact");
    return artifactBytes(request.content);
  }

  try {
    return await inspectStagedTrace(storage, request.uploadId);
  } catch (error) {
    if (error instanceof StagedTraceNotFoundError) {
      throw new PublishError(error.message, 404, "staged_trace_not_found");
    }
    if (error instanceof InvalidStagedTraceError) {
      throw new PublishError(error.message, 422, "invalid_artifact");
    }
    throw error;
  }
}

async function replacementMeta(
  request: PublishRequest,
  publisherEmail: string
): Promise<ShareMeta | null> {
  const slug = request.replaceSlug?.trim();
  if (!slug) return null;

  const authz = await authorizeShareMutation(slug, request.editToken, publisherEmail);
  if (!authz.ok) {
    throw new PublishError(
      authz.error,
      authz.status,
      authz.status === 404 ? "share_not_found" : "publisher_forbidden"
    );
  }
  if (authz.meta.kind !== request.kind) {
    throw new PublishError(
      "Artifact kind cannot change on Replace",
      422,
      "artifact_kind_mismatch"
    );
  }
  return authz.meta;
}

async function writeShare(
  storage: StorageDriver,
  meta: ShareMeta,
  request: PublishRequest
): Promise<void> {
  if (request.kind === "trace") {
    await storage.commitStagedTrace(meta, request.uploadId);
    return;
  }
  await storage.put(meta, new TextEncoder().encode(request.content));
}

function result(meta: ShareMeta, replaced: boolean): PublishResult {
  return {
    slug: meta.slug,
    replaced,
    kind: meta.kind,
    publishedBy: meta.publishedBy,
    expiresAt: meta.expiresAt,
  };
}

export async function publishShare(
  request: PublishRequest,
  publisherEmail: string
): Promise<PublishResult> {
  const storage = getStorage();
  try {
    // Replace authorization and kind checks intentionally precede staged reads.
    const previous = await replacementMeta(request, publisherEmail);
    const size = await prepareArtifact(storage, request);
    const now = new Date().toISOString();
    const meta: ShareMeta = previous
      ? { ...previous, size, updatedAt: now }
      : {
          slug: nanoid(8),
          kind: request.kind,
          editTokenHash: "",
          createdAt: now,
          updatedAt: now,
          size,
          publishedBy: publisherEmail,
          ...(request.kind === "trace" ? { expiresAt: traceExpiresAt(now) } : {}),
        };

    await writeShare(storage, meta, request);
    return result(meta, previous !== null);
  } finally {
    if (request.kind === "trace") {
      // One cleanup path covers success, validation, authorization, and storage failures.
      await storage.deleteStagedTrace(request.uploadId).catch(() => {});
    }
  }
}
