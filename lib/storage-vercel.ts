import { del, get, put, type BlobAccessType } from "@vercel/blob";
import { Redis } from "@upstash/redis";
import type { ShareMeta, StorageDriver } from "@/lib/storage";

const BLOB_PREFIX = "shares";
const META_PREFIX = "canvas:share:";

/** Must match the Blob store access mode chosen at creation (public is the default). */
function blobAccess(): BlobAccessType {
  return process.env.BLOB_STORE_ACCESS?.toLowerCase() === "private" ? "private" : "public";
}

function blobPath(slug: string): string {
  return `${BLOB_PREFIX}/${slug}.html`;
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
    const meta = await getRedis().get<ShareMeta>(metaKey(slug));
    return meta ?? null;
  }

  async getArtifact(slug: string): Promise<string | null> {
    const result = await get(blobPath(slug), { access: blobAccess() });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return null;
    }
    return readStream(result.stream);
  }

  async put(meta: ShareMeta, html: string): Promise<void> {
    await put(blobPath(meta.slug), html, {
      access: blobAccess(),
      contentType: "text/html; charset=utf-8",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    await getRedis().set(metaKey(meta.slug), meta);
  }

  async delete(slug: string): Promise<void> {
    await del(blobPath(slug));
    await getRedis().del(metaKey(slug));
  }
}

function hasRedisEnv(): boolean {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return Boolean(url && token);
}

export function isVercelStorageConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN && hasRedisEnv());
}
