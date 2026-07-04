import { del, get, put, type BlobAccessType } from "@vercel/blob";
import { Redis } from "@upstash/redis";
import { ARTIFACT_KIND, type ArtifactKind } from "@/lib/artifact-kind";
import type { ShareArtifact, ShareMeta, StorageDriver, StoredShareMeta } from "@/lib/storage";

const BLOB_PREFIX = "shares";
const META_PREFIX = "canvas:share:";

/** Must match the Blob store access mode chosen at creation (public is the default). */
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

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = Redis.fromEnv();
  }
  return redis;
}

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(stream).text();
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

  async getArtifact(slug: string): Promise<ShareArtifact | null> {
    const meta = await this.getMeta(slug);
    if (!meta) return null;

    const path = meta.blobPath ?? legacyBlobPath(slug);
    const access = blobAccess();
    const result = await get(path, {
      access,
      // Private stores can bypass CDN; public blobs rely on versioned pathnames.
      ...(access === "private" ? { useCache: false } : {}),
    });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return null;
    }
    return { body: await readStream(result.stream), meta };
  }

  async put(meta: ShareMeta, body: string): Promise<void> {
    const previous = await this.getMeta(meta.slug);
    const path = versionedBlobPath(meta.slug, meta.updatedAt, meta.kind);

    await put(path, body, {
      access: blobAccess(),
      contentType: ARTIFACT_KIND[meta.kind].contentType,
      addRandomSuffix: false,
    });

    if (previous?.blobPath && previous.blobPath !== path) {
      await del(previous.blobPath).catch(() => {});
    } else if (previous && !previous.blobPath) {
      await del(legacyBlobPath(meta.slug)).catch(() => {});
    }

    await getRedis().set(metaKey(meta.slug), { ...meta, blobPath: path });
  }

  async delete(slug: string): Promise<void> {
    const meta = await this.getMeta(slug);
    if (meta?.blobPath) {
      await del(meta.blobPath).catch(() => {});
    } else {
      await del(legacyBlobPath(slug)).catch(() => {});
    }
    await getRedis().del(metaKey(slug));
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
