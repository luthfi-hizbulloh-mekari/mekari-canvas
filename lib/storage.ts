import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import {
  isVercelStorageConfigured,
  storageConfigHint,
  VercelDriver,
} from "./storage-vercel";

export type ShareMeta = {
  slug: string;
  editTokenHash: string;
  createdAt: string;
  updatedAt: string;
  size: number;
  /** Current blob object key; new key on each replace avoids CDN stale reads. */
  blobPath?: string;
};

export interface StorageDriver {
  getMeta(slug: string): Promise<ShareMeta | null>;
  getArtifact(slug: string): Promise<string | null>;
  put(meta: ShareMeta, html: string): Promise<void>;
  delete(slug: string): Promise<void>;
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

  private async readIndex(): Promise<Record<string, ShareMeta>> {
    try {
      return JSON.parse(await fs.readFile(this.indexFile, "utf8"));
    } catch {
      return {};
    }
  }

  private async writeIndex(index: Record<string, ShareMeta>): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
    await fs.writeFile(this.indexFile, JSON.stringify(index, null, 2));
  }

  async getMeta(slug: string): Promise<ShareMeta | null> {
    const index = await this.readIndex();
    return index[slug] ?? null;
  }

  private blobFile(slug: string, updatedAt: string): string {
    return path.join(this.blobDir, slug, `${Date.parse(updatedAt)}.html`);
  }

  private legacyBlobFile(slug: string): string {
    return path.join(this.blobDir, `${slug}.html`);
  }

  async getArtifact(slug: string): Promise<string | null> {
    const meta = await this.getMeta(slug);
    if (meta?.blobPath) {
      try {
        return await fs.readFile(path.join(this.blobDir, meta.blobPath), "utf8");
      } catch {
        return null;
      }
    }
    try {
      return await fs.readFile(this.legacyBlobFile(slug), "utf8");
    } catch {
      return null;
    }
  }

  async put(meta: ShareMeta, html: string): Promise<void> {
    const previous = await this.getMeta(meta.slug);
    const blobPath = path.join(meta.slug, `${Date.parse(meta.updatedAt)}.html`);
    const blobFile = path.join(this.blobDir, blobPath);

    await fs.mkdir(path.dirname(blobFile), { recursive: true });
    await fs.writeFile(blobFile, html);

    if (previous?.blobPath) {
      await fs.rm(path.join(this.blobDir, previous.blobPath), { force: true });
    } else if (previous) {
      await fs.rm(this.legacyBlobFile(meta.slug), { force: true });
    }

    const index = await this.readIndex();
    index[meta.slug] = { ...meta, blobPath };
    await this.writeIndex(index);
  }

  async delete(slug: string): Promise<void> {
    const meta = await this.getMeta(slug);
    if (meta?.blobPath) {
      await fs.rm(path.join(this.blobDir, meta.blobPath), { force: true });
    } else {
      await fs.rm(this.legacyBlobFile(slug), { force: true });
    }
    const index = await this.readIndex();
    delete index[slug];
    await this.writeIndex(index);
  }
}

let driver: StorageDriver | null = null;

export function getStorage(): StorageDriver {
  if (!driver) {
    if (isVercelStorageConfigured()) {
      driver = new VercelDriver();
    } else if (process.env.VERCEL === "1") {
      throw new Error(`Storage misconfigured on Vercel. ${storageConfigHint()}`);
    } else {
      driver = new LocalDriver();
    }
  }
  return driver;
}
