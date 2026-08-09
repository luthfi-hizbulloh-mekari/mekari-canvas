import { nanoid } from "nanoid";
import type { ArtifactKind, TextArtifactKind } from "@/lib/artifact-kind";
import type { Artifact, PublishRequest } from "@/lib/publish-request";
import { authorizeShareMutation } from "@/lib/share-authz";
import { StagedTraceNotFoundError } from "@/lib/storage-errors";
import { getStorage, type ShareMeta, type StorageDriver } from "@/lib/storage";
import { decideTraceRetention, isValidTraceSize } from "@/lib/trace-expiry";
import { inspectStagedTrace, InvalidStagedTraceError } from "@/lib/trace-staging";
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
      | "invalid_share_metadata"
  ) {
    super(message);
    this.name = "PublishError";
  }
}

export type PublishResult = {
  slug: string;
  edited: boolean;
  kind: ArtifactKind;
  title?: string;
  publishedBy?: string;
  expiresAt?: string | null;
};

function invalidShareMetadataError(): PublishError {
  return new PublishError(
    "Existing Share has invalid size metadata",
    422,
    "invalid_share_metadata"
  );
}

async function prepareArtifact(storage: StorageDriver, artifact: Artifact): Promise<number> {
  if (artifact.kind !== "trace") {
    const invalid = validateTextArtifact(artifact.content, artifact.kind);
    if (invalid) throw new PublishError(invalid, 422, "invalid_artifact");
    return artifactBytes(artifact.content);
  }

  try {
    return await inspectStagedTrace(storage, artifact.uploadId);
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

async function authorizeEdit(
  slug: string,
  editToken: string | undefined,
  publisherEmail: string
): Promise<ShareMeta> {
  const authz = await authorizeShareMutation(slug, editToken, publisherEmail);
  if (!authz.ok) {
    throw new PublishError(
      authz.error,
      authz.status,
      authz.status === 404 ? "share_not_found" : "publisher_forbidden"
    );
  }
  return authz.meta;
}

async function writeArtifact(
  storage: StorageDriver,
  meta: ShareMeta,
  artifact: Artifact
): Promise<void> {
  if (artifact.kind === "trace") {
    await storage.commitStagedTrace(meta, artifact.uploadId);
    return;
  }
  await storage.put(meta, new TextEncoder().encode(artifact.content));
}

function result(meta: ShareMeta, edited: boolean): PublishResult {
  return {
    slug: meta.slug,
    edited,
    kind: meta.kind,
    title: meta.title,
    publishedBy: meta.publishedBy,
    expiresAt: meta.kind === "trace" ? (meta.expiresAt ?? null) : undefined,
  };
}

function applyTitle(meta: ShareMeta, title: string | null | undefined): ShareMeta {
  if (title === undefined) return meta;
  if (title !== null) return { ...meta, title };
  const { title: _removed, ...withoutTitle } = meta;
  return withoutTitle;
}

function traceMeta(
  previous: ShareMeta | null,
  size: number,
  now: string,
  publisherEmail: string
): ShareMeta {
  const expiresAt = decideTraceRetention(previous, size, now);
  const meta: ShareMeta = {
    slug: previous?.slug ?? nanoid(8),
    kind: "trace",
    editTokenHash: previous?.editTokenHash ?? "",
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    size,
    publishedBy: previous ? previous.publishedBy : publisherEmail,
    ...(expiresAt === undefined ? {} : { expiresAt }),
    ...(previous?.title ? { title: previous.title } : {}),
  };
  return meta;
}

function textMeta(
  previous: ShareMeta | null,
  size: number,
  now: string,
  publisherEmail: string,
  kind: TextArtifactKind
): ShareMeta {
  return previous
    ? { ...previous, size, updatedAt: now }
    : {
        slug: nanoid(8),
        kind,
        editTokenHash: "",
        createdAt: now,
        updatedAt: now,
        size,
        publishedBy: publisherEmail,
      };
}

async function publishArtifact(
  artifact: Artifact,
  title: string | null | undefined,
  publisherEmail: string,
  loadPrevious: () => Promise<ShareMeta | null>
): Promise<PublishResult> {
  const storage = getStorage();
  try {
    // Authorization stays inside this cleanup boundary so staged traces are always removed.
    const previous = await loadPrevious();
    if (previous && previous.kind !== artifact.kind) {
      throw new PublishError(
        "Artifact kind cannot change on Edit",
        422,
        "artifact_kind_mismatch"
      );
    }
    if (previous && artifact.kind === "trace" && !isValidTraceSize(previous.size)) {
      throw invalidShareMetadataError();
    }

    const size = await prepareArtifact(storage, artifact);
    const now = new Date().toISOString();
    const base = artifact.kind === "trace"
      ? traceMeta(previous, size, now, publisherEmail)
      : textMeta(previous, size, now, publisherEmail, artifact.kind);
    const meta = applyTitle(base, title);

    await writeArtifact(storage, meta, artifact);
    return result(meta, previous !== null);
  } finally {
    if (artifact.kind === "trace") {
      await storage.deleteStagedTrace(artifact.uploadId).catch(() => {});
    }
  }
}

async function editShare(
  request: Extract<PublishRequest, { mode: "edit" }>,
  publisherEmail: string
): Promise<PublishResult> {
  if (request.artifact) {
    return publishArtifact(request.artifact, request.title, publisherEmail, () =>
      authorizeEdit(request.slug, request.editToken, publisherEmail)
    );
  }

  const storage = getStorage();
  const previous = await authorizeEdit(request.slug, request.editToken, publisherEmail);
  const meta = applyTitle(previous, request.title);
  await storage.putMeta(meta);
  return result(meta, true);
}

export async function publishShare(
  request: PublishRequest,
  publisherEmail: string
): Promise<PublishResult> {
  if (request.mode === "create") {
    return publishArtifact(request.artifact, request.title, publisherEmail, async () => null);
  }
  return editShare(request, publisherEmail);
}
