import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { ARTIFACT_KIND, type ArtifactKind } from "@/lib/artifact-kind";
import {
  isVercelStorageConfigured,
  storageConfigHint,
  VercelDriver,
} from "./storage-vercel";

export type ShareMeta = {
  slug: string;
  kind: ArtifactKind;
  editTokenHash: string;
  createdAt: string;
  updatedAt: string;
  size: number;
  /** Publisher email at create; absent on legacy Shares. */
  publishedBy?: string;
  /** Current blob object key; new key on each replace avoids CDN stale reads. */
  blobPath?: string;
};

export type StoredShareMeta = Omit<ShareMeta, "kind"> & { kind?: ArtifactKind };
export type StoredShareIndex = Record<string, StoredShareMeta>;
export type ShareArtifact = { body: string; meta: ShareMeta };

export interface StorageDriver {
  getMeta(slug: string): Promise<ShareMeta | null>;
  getArtifact(slug: string): Promise<ShareArtifact | null>;
  put(meta: ShareMeta, body: string): Promise<void>;
  delete(slug: string): Promise<void>;
  listByPublisher(publisherEmail: string): Promise<ShareMeta[]>;
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

  async getArtifact(slug: string): Promise<ShareArtifact | null> {
    const meta = await this.getMeta(slug);
    if (!meta) return null;

    if (meta.blobPath) {
      try {
        return { body: await fs.readFile(path.join(this.blobDir, meta.blobPath), "utf8"), meta };
      } catch {
        return null;
      }
    }

    try {
      return { body: await fs.readFile(this.legacyBlobFile(slug), "utf8"), meta };
    } catch {
      return null;
    }
  }

  async put(meta: ShareMeta, body: string): Promise<void> {
    const previous = await this.getMeta(meta.slug);
    const blobPath = path.join(
      meta.slug,
      `${Date.parse(meta.updatedAt)}${ARTIFACT_KIND[meta.kind].ext}`
    );
    const blobFile = path.join(this.blobDir, blobPath);

    await fs.mkdir(path.dirname(blobFile), { recursive: true });
    await fs.writeFile(blobFile, body);

    if (previous?.blobPath) {
      await fs.rm(path.join(this.blobDir, previous.blobPath), { force: true });
    } else if (previous) {
      await fs.rm(this.legacyBlobFile(meta.slug), { force: true });
    }

    const index = await this.readIndex();
    index[meta.slug] = { ...meta, blobPath };
    await this.writeIndex(index);

    if (meta.publishedBy && !previous) {
      await this.addPublisherSlug(meta.publishedBy, meta.slug);
    }
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

    if (meta?.publishedBy) {
      await this.removePublisherSlug(meta.publishedBy, slug);
    }
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
