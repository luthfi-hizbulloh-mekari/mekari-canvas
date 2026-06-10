import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { isVercelStorageConfigured, VercelDriver } from "./storage-vercel";

export type ShareMeta = {
  slug: string;
  editTokenHash: string;
  createdAt: string;
  updatedAt: string;
  size: number;
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

  async getArtifact(slug: string): Promise<string | null> {
    try {
      return await fs.readFile(path.join(this.blobDir, `${slug}.html`), "utf8");
    } catch {
      return null;
    }
  }

  async put(meta: ShareMeta, html: string): Promise<void> {
    await fs.mkdir(this.blobDir, { recursive: true });
    await fs.writeFile(path.join(this.blobDir, `${meta.slug}.html`), html);
    const index = await this.readIndex();
    index[meta.slug] = meta;
    await this.writeIndex(index);
  }

  async delete(slug: string): Promise<void> {
    await fs.rm(path.join(this.blobDir, `${slug}.html`), { force: true });
    const index = await this.readIndex();
    delete index[slug];
    await this.writeIndex(index);
  }
}

let driver: StorageDriver | null = null;

export function getStorage(): StorageDriver {
  if (!driver) {
    driver = isVercelStorageConfigured() ? new VercelDriver() : new LocalDriver();
  }
  return driver;
}
