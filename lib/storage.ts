import { createHash, randomUUID } from "crypto";
import { createReadStream } from "fs";
import { promises as fs } from "fs";
import path from "path";
import { Readable } from "stream";
import { ARTIFACT_KIND, type ArtifactKind } from "@/lib/artifact-kind";
import {
  StagedTraceAlreadyExistsError,
  StagedTraceNotFoundError,
  StorageMisconfiguredError,
} from "@/lib/storage-errors";
import { isExpired } from "@/lib/trace-expiry";
import {
  localStagedTraceFile,
  STAGING_PREFIX,
  STAGING_RETENTION_MS,
} from "@/lib/trace-paths";
import {
  isVercelStorageConfigured,
  storageConfigHint,
  VercelDriver,
} from "./storage-vercel";

export type ShareMeta = {
  slug: string;
  kind: ArtifactKind;
  title?: string;
  editTokenHash: string;
  createdAt: string;
  updatedAt: string;
  size: number;
  /** Publisher email at create; absent on legacy Shares. */
  publishedBy?: string;
  /** Current blob object key; new key on each Artifact Edit avoids CDN stale reads. */
  blobPath?: string;
  /** Present only for expiring Playwright Trace Shares. */
  expiresAt?: string;
};

export type StoredShareMeta = Omit<ShareMeta, "kind"> & { kind?: ArtifactKind };
export type StoredShareIndex = Record<string, StoredShareMeta>;

export interface StorageDriver {
  getMeta(slug: string): Promise<ShareMeta | null>;
  open(meta: ShareMeta): Promise<ReadableStream<Uint8Array> | null>;
  put(meta: ShareMeta, body: Uint8Array | ReadableStream<Uint8Array>): Promise<void>;
  putMeta(meta: ShareMeta): Promise<void>;
  createTraceUpload(uploadId: string, localApiBase: string): Promise<string>;
  receiveTraceUpload(uploadId: string, body: ReadableStream<Uint8Array>): Promise<void>;
  stagedTraceSize(uploadId: string): Promise<number>;
  readStagedTraceRange(uploadId: string, start: number, end: number): Promise<Uint8Array>;
  deleteStagedTrace(uploadId: string): Promise<void>;
  deleteStaleTraceUploads(now: number): Promise<number>;
  commitStagedTrace(meta: ShareMeta, uploadId: string): Promise<void>;
  delete(slug: string): Promise<void>;
  listByPublisher(publisherEmail: string): Promise<ShareMeta[]>;
  expiredTraceSlugs(now: number): Promise<string[]>;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Local filesystem driver for development. Artifacts live in .data/blobs,
 * the slug index in .data/index.json — mirroring the Blob + KV split so the
 * Vercel driver can swap in behind the same interface (see ADR 0001).
 */
class LocalDriver implements StorageDriver {
  private dataDir = path.join(process.cwd(), ".data");
  private blobDir = path.join(this.dataDir, "blobs");
  private indexFile = path.join(this.dataDir, "index.json");
  private publisherIndexFile = path.join(this.dataDir, "publisher-slugs.json");

  private async readIndex(): Promise<StoredShareIndex> {
    try {
      return JSON.parse(await fs.readFile(this.indexFile, "utf8"));
    } catch {
      return {};
    }
  }

  private async writeIndex(index: StoredShareIndex): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
    await fs.writeFile(this.indexFile, JSON.stringify(index, null, 2));
  }

  private async readPublisherIndex(): Promise<Record<string, string[]>> {
    try {
      return JSON.parse(await fs.readFile(this.publisherIndexFile, "utf8"));
    } catch {
      return {};
    }
  }

  private async writePublisherIndex(index: Record<string, string[]>): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
    await fs.writeFile(this.publisherIndexFile, JSON.stringify(index, null, 2));
  }

  private async addPublisherSlug(publisherEmail: string, slug: string): Promise<void> {
    const index = await this.readPublisherIndex();
    const slugs = index[publisherEmail] ?? [];
    if (!slugs.includes(slug)) {
      index[publisherEmail] = [slug, ...slugs];
      await this.writePublisherIndex(index);
    }
  }

  private async removePublisherSlug(publisherEmail: string, slug: string): Promise<void> {
    const index = await this.readPublisherIndex();
    const slugs = index[publisherEmail];
    if (!slugs) return;
    index[publisherEmail] = slugs.filter((s) => s !== slug);
    await this.writePublisherIndex(index);
  }

  async getMeta(slug: string): Promise<ShareMeta | null> {
    const index = await this.readIndex();
    const meta = index[slug];
    return meta ? { ...meta, kind: meta.kind ?? "html" } : null;
  }

  private legacyBlobFile(slug: string): string {
    return path.join(this.blobDir, `${slug}.html`);
  }

  private artifactFile(meta: ShareMeta): string {
    return meta.blobPath
      ? path.join(this.blobDir, meta.blobPath)
      : this.legacyBlobFile(meta.slug);
  }

  async open(meta: ShareMeta): Promise<ReadableStream<Uint8Array> | null> {
    try {
      const file = this.artifactFile(meta);
      await fs.stat(file);
      return Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>;
    } catch {
      return null;
    }
  }

  async createTraceUpload(uploadId: string, localApiBase: string): Promise<string> {
    return `${localApiBase}/api/trace-uploads/${uploadId}`;
  }

  async receiveTraceUpload(
    uploadId: string,
    body: ReadableStream<Uint8Array>
  ): Promise<void> {
    const file = localStagedTraceFile(uploadId);
    const temporaryFile = `${file}.${randomUUID()}.upload`;
    await fs.mkdir(path.dirname(file), { recursive: true });
    const handle = await fs.open(temporaryFile, "wx");
    const reader = body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await handle.write(value);
      }
      await handle.close();
      try {
        // link() is atomic and refuses an existing destination, unlike rename().
        await fs.link(temporaryFile, file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          throw new StagedTraceAlreadyExistsError();
        }
        throw error;
      }
    } finally {
      reader.releaseLock();
      await handle.close().catch(() => {});
      await fs.rm(temporaryFile, { force: true });
    }
  }

  async stagedTraceSize(uploadId: string): Promise<number> {
    try {
      return (await fs.stat(localStagedTraceFile(uploadId))).size;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new StagedTraceNotFoundError();
      }
      throw error;
    }
  }

  async readStagedTraceRange(
    uploadId: string,
    start: number,
    end: number
  ): Promise<Uint8Array> {
    const length = end - start + 1;
    const bytes = new Uint8Array(length);
    let handle: Awaited<ReturnType<typeof fs.open>>;
    try {
      handle = await fs.open(localStagedTraceFile(uploadId), "r");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new StagedTraceNotFoundError();
      }
      throw error;
    }
    try {
      const { bytesRead } = await handle.read(bytes, 0, length, start);
      return bytes.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  }

  async deleteStagedTrace(uploadId: string): Promise<void> {
    await fs.rm(localStagedTraceFile(uploadId), { force: true });
  }

  async deleteStaleTraceUploads(now: number): Promise<number> {
    const cutoff = now - STAGING_RETENTION_MS;
    const directory = path.join(process.cwd(), ".data", STAGING_PREFIX);
    let entries: string[];
    try {
      entries = await fs.readdir(directory);
    } catch {
      return 0;
    }
    let deleted = 0;
    for (const entry of entries) {
      const file = path.join(directory, entry);
      const info = await fs.stat(file).catch(() => null);
      if (info?.isFile() && info.mtimeMs < cutoff) {
        await fs.rm(file, { force: true });
        deleted++;
      }
    }
    return deleted;
  }

  private async writeBody(
    file: string,
    body: Uint8Array | ReadableStream<Uint8Array>
  ): Promise<void> {
    await fs.mkdir(path.dirname(file), { recursive: true });
    if (body instanceof Uint8Array) {
      await fs.writeFile(file, body);
      return;
    }
    const handle = await fs.open(file, "w");
    const reader = body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await handle.write(value);
      }
    } finally {
      reader.releaseLock();
      await handle.close();
    }
  }

  private async commitMeta(
    meta: ShareMeta,
    previous: ShareMeta | null,
    blobPath: string
  ): Promise<void> {
    const index = await this.readIndex();
    index[meta.slug] = { ...meta, blobPath };
    await this.writeIndex(index);

    if (meta.publishedBy && !previous) {
      await this.addPublisherSlug(meta.publishedBy, meta.slug);
    }
  }

  private async deletePrevious(previous: ShareMeta | null, nextBlobPath: string): Promise<void> {
    if (previous?.blobPath && previous.blobPath !== nextBlobPath) {
      await fs.rm(path.join(this.blobDir, previous.blobPath), { force: true });
    } else if (previous && !previous.blobPath) {
      await fs.rm(this.legacyBlobFile(previous.slug), { force: true });
    }
  }

  async put(
    meta: ShareMeta,
    body: Uint8Array | ReadableStream<Uint8Array>
  ): Promise<void> {
    const previous = await this.getMeta(meta.slug);
    const blobPath = path.join(
      meta.slug,
      `${Date.parse(meta.updatedAt)}${ARTIFACT_KIND[meta.kind].ext}`
    );
    const blobFile = path.join(this.blobDir, blobPath);

    await this.writeBody(blobFile, body);
    await this.commitMeta(meta, previous, blobPath);
    await this.deletePrevious(previous, blobPath);
  }

  async putMeta(meta: ShareMeta): Promise<void> {
    const index = await this.readIndex();
    index[meta.slug] = { ...meta };
    await this.writeIndex(index);
  }

  async commitStagedTrace(meta: ShareMeta, uploadId: string): Promise<void> {
    const previous = await this.getMeta(meta.slug);
    const blobPath = path.join(
      meta.slug,
      `${Date.parse(meta.updatedAt)}${ARTIFACT_KIND.trace.ext}`
    );
    const blobFile = path.join(this.blobDir, blobPath);
    await fs.mkdir(path.dirname(blobFile), { recursive: true });
    await fs.copyFile(localStagedTraceFile(uploadId), blobFile);
    await this.commitMeta(meta, previous, blobPath);
    await this.deletePrevious(previous, blobPath);
  }

  async delete(slug: string): Promise<void> {
    const meta = await this.getMeta(slug);
    if (meta?.blobPath) {
      await fs.rm(path.join(this.blobDir, meta.blobPath), { force: true });
    } else {
      await fs.rm(this.legacyBlobFile(slug), { force: true });
    }
    if (meta?.publishedBy) {
      await this.removePublisherSlug(meta.publishedBy, slug);
    }

    const index = await this.readIndex();
    delete index[slug];
    await this.writeIndex(index);
  }

  async listByPublisher(publisherEmail: string): Promise<ShareMeta[]> {
    const publisherIndex = await this.readPublisherIndex();
    const slugs = publisherIndex[publisherEmail] ?? [];
    const shares: ShareMeta[] = [];
    for (const slug of slugs) {
      const meta = await this.getMeta(slug);
      if (meta) shares.push(meta);
    }
    return shares.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }

  async expiredTraceSlugs(now: number): Promise<string[]> {
    const index = await this.readIndex();
    return Object.values(index)
      .map((meta) => ({ ...meta, kind: meta.kind ?? "html" }))
      .filter(
        (meta) =>
          meta.kind === "trace" && isExpired(meta, now)
      )
      .map((meta) => meta.slug);
  }
}

let driver: StorageDriver | null = null;

export function getStorage(): StorageDriver {
  if (!driver) {
    if (isVercelStorageConfigured()) {
      driver = new VercelDriver();
    } else if (process.env.VERCEL === "1") {
      throw new StorageMisconfiguredError(
        `Storage misconfigured on Vercel. ${storageConfigHint()}`
      );
    } else {
      driver = new LocalDriver();
    }
  }
  return driver;
}
