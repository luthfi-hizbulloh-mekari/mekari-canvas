import {
  BlobNotFoundError,
  copy,
  del,
  get,
  head,
  issueSignedToken,
  list,
  presignUrl,
  put,
  type BlobAccessType,
} from "@vercel/blob";
import { ARTIFACT_KIND, type ArtifactKind } from "@/lib/artifact-kind";
import { getRedis } from "@/lib/redis";
import {
  DirectTraceUploadUnavailableError,
  StagedTraceNotFoundError,
} from "@/lib/storage-errors";
import type { ShareMeta, StorageDriver, StoredShareMeta } from "@/lib/storage";
import {
  stagedTracePath,
  STAGING_PREFIX,
  STAGING_RETENTION_MS,
} from "@/lib/trace-paths";

const BLOB_PREFIX = "shares";
const META_PREFIX = "canvas:share:";
const PUBLISHER_SLUGS_PREFIX = "canvas:publisher:slugs:";
const TRACE_EXPIRY_KEY = "canvas:trace:expiry";
const UPLOAD_URL_TTL_MS = 15 * 60 * 1000;

/** Text Artifacts follow the configured store default; traces explicitly use private access. */
function blobAccess(): BlobAccessType {
  return process.env.BLOB_STORE_ACCESS?.toLowerCase() === "private" ? "private" : "public";
}

function legacyBlobPath(slug: string): string {
  return `${BLOB_PREFIX}/${slug}.html`;
}

function versionedBlobPath(slug: string, updatedAt: string, kind: ArtifactKind): string {
  return `${BLOB_PREFIX}/${slug}/${Date.parse(updatedAt)}${ARTIFACT_KIND[kind].ext}`;
}

function metaKey(slug: string): string {
  return `${META_PREFIX}${slug}`;
}

function publisherSlugsKey(email: string): string {
  return `${PUBLISHER_SLUGS_PREFIX}${email}`;
}

/**
 * Production driver: artifact bodies in Vercel Blob, slug metadata in Upstash Redis.
 * See docs/adr/0001-vercel-blob-kv-storage.md.
 */
export class VercelDriver implements StorageDriver {
  async getMeta(slug: string): Promise<ShareMeta | null> {
    const meta = await getRedis().get<StoredShareMeta>(metaKey(slug));
    return meta ? { ...meta, kind: meta.kind ?? "html" } : null;
  }

  async open(meta: ShareMeta) {
    const path = meta.blobPath ?? legacyBlobPath(meta.slug);
    const access = meta.kind === "trace" ? "private" : blobAccess();
    const result = await get(path, {
      access,
      // Private stores can bypass CDN; public blobs rely on versioned pathnames.
      ...(access === "private" ? { useCache: false } : {}),
    });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return null;
    }
    return { stream: result.stream, size: result.blob.size };
  }

  async createTraceUpload(uploadId: string, _localApiBase: string): Promise<string> {
    const pathname = stagedTracePath(uploadId);
    const validUntil = Date.now() + UPLOAD_URL_TTL_MS;
    const constraints = {
      allowedContentTypes: [ARTIFACT_KIND.trace.contentType],
      maximumSizeInBytes: ARTIFACT_KIND.trace.maxBytes,
    };
    const signedToken = await issueSignedToken({
      pathname,
      operations: ["put"],
      validUntil,
      ...constraints,
    });
    const { presignedUrl } = await presignUrl(signedToken, {
      operation: "put",
      pathname,
      access: "private",
      validUntil,
      allowOverwrite: false,
      addRandomSuffix: false,
      ...constraints,
    });
    return presignedUrl;
  }

  async receiveTraceUpload(
    _uploadId: string,
    _body: ReadableStream<Uint8Array>
  ): Promise<void> {
    throw new DirectTraceUploadUnavailableError();
  }

  async stagedTraceSize(uploadId: string): Promise<number> {
    try {
      return (await head(stagedTracePath(uploadId))).size;
    } catch (error) {
      if (error instanceof BlobNotFoundError) throw new StagedTraceNotFoundError();
      throw error;
    }
  }

  async readStagedTraceRange(
    uploadId: string,
    start: number,
    end: number
  ): Promise<Uint8Array> {
    const result = await get(stagedTracePath(uploadId), {
      access: "private",
      useCache: false,
      headers: { range: `bytes=${start}-${end}` },
    });
    if (!result || !result.stream) throw new StagedTraceNotFoundError();
    if (start > 0 && !result.headers.get("content-range")) {
      await result.stream.cancel();
      throw new Error("Private Blob store did not honor the trace validation Range request");
    }
    return new Uint8Array(await new Response(result.stream).arrayBuffer());
  }

  async deleteStagedTrace(uploadId: string): Promise<void> {
    await del(stagedTracePath(uploadId)).catch(() => {});
  }

  async deleteStaleTraceUploads(now: number): Promise<number> {
    const cutoff = now - STAGING_RETENTION_MS;
    let cursor: string | undefined;
    const stalePaths: string[] = [];
    do {
      const page = await list({ prefix: STAGING_PREFIX, cursor });
      stalePaths.push(
        ...page.blobs
          .filter((blob) => blob.uploadedAt.getTime() < cutoff)
          .map((blob) => blob.pathname)
      );
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    for (let at = 0; at < stalePaths.length; at += 100) {
      await del(stalePaths.slice(at, at + 100));
    }
    return stalePaths.length;
  }

  private async commitMeta(
    meta: ShareMeta,
    previous: ShareMeta | null,
    path: string
  ): Promise<void> {
    const redis = getRedis();
    const transaction = redis.multi();
    transaction.set(metaKey(meta.slug), { ...meta, blobPath: path });
    if (meta.publishedBy && !previous) {
      transaction.sadd(publisherSlugsKey(meta.publishedBy), meta.slug);
    }
    if (meta.kind === "trace" && meta.expiresAt) {
      transaction.zadd(TRACE_EXPIRY_KEY, {
        score: Date.parse(meta.expiresAt),
        member: meta.slug,
      });
    }
    await transaction.exec();
  }

  private async deletePrevious(
    previous: ShareMeta | null,
    nextPath: string
  ): Promise<void> {
    if (previous?.blobPath && previous.blobPath !== nextPath) {
      await del(previous.blobPath).catch(() => {});
    } else if (previous && !previous.blobPath) {
      await del(legacyBlobPath(previous.slug)).catch(() => {});
    }
  }

  async put(
    meta: ShareMeta,
    body: Uint8Array | ReadableStream<Uint8Array>
  ): Promise<void> {
    const previous = await this.getMeta(meta.slug);
    const path = versionedBlobPath(meta.slug, meta.updatedAt, meta.kind);

    await put(path, body instanceof Uint8Array ? Buffer.from(body) : body, {
      access: blobAccess(),
      contentType: ARTIFACT_KIND[meta.kind].contentType,
      addRandomSuffix: false,
    });

    await this.commitMeta(meta, previous, path);
    await this.deletePrevious(previous, path);
  }

  async commitStagedTrace(meta: ShareMeta, uploadId: string): Promise<void> {
    const previous = await this.getMeta(meta.slug);
    const path = versionedBlobPath(meta.slug, meta.updatedAt, "trace");
    await copy(stagedTracePath(uploadId), path, {
      access: "private",
      contentType: ARTIFACT_KIND.trace.contentType,
      addRandomSuffix: false,
    });
    await this.commitMeta(meta, previous, path);
    await this.deletePrevious(previous, path);
  }

  async delete(slug: string): Promise<void> {
    const meta = await this.getMeta(slug);
    if (meta?.blobPath) {
      await del(meta.blobPath).catch(() => {});
    } else {
      await del(legacyBlobPath(slug)).catch(() => {});
    }
    if (meta?.publishedBy) {
      await getRedis().srem(publisherSlugsKey(meta.publishedBy), slug);
    }
    await getRedis().del(metaKey(slug));
    // Remove this last so a partially failed delete remains eligible for a later sweep.
    await getRedis().zrem(TRACE_EXPIRY_KEY, slug);
  }

  async listByPublisher(publisherEmail: string): Promise<ShareMeta[]> {
    const slugs = await getRedis().smembers(publisherSlugsKey(publisherEmail));
    const shares: ShareMeta[] = [];
    for (const slug of slugs) {
      const meta = await this.getMeta(slug);
      if (meta) shares.push(meta);
    }
    return shares.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }

  async expiredTraceSlugs(now: number): Promise<string[]> {
    return getRedis().zrange<string[]>(TRACE_EXPIRY_KEY, 0, now, {
      byScore: true,
    });
  }
}

function hasRedisEnv(): boolean {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return Boolean(url && token);
}

/** Linked Blob stores may use a read-write token or OIDC + store ID on Vercel. */
function hasBlobEnv(): boolean {
  if (process.env.BLOB_READ_WRITE_TOKEN) return true;
  // Store linked via dashboard: BLOB_STORE_ID + runtime OIDC (no BLOB_READ_WRITE_TOKEN).
  return Boolean(process.env.BLOB_STORE_ID && process.env.VERCEL === "1");
}

export function isVercelStorageConfigured(): boolean {
  return hasBlobEnv() && hasRedisEnv();
}

export function storageConfigHint(): string {
  const missing: string[] = [];
  if (!hasBlobEnv()) {
    missing.push("Blob (BLOB_READ_WRITE_TOKEN or linked BLOB_STORE_ID)");
  }
  if (!hasRedisEnv()) {
    missing.push("Redis (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)");
  }
  return missing.length ? `Missing: ${missing.join(", ")}` : "ok";
}
