import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { nanoid } from "nanoid";
import { getRedis } from "@/lib/redis";
import { isVercelStorageConfigured } from "@/lib/storage-vercel";

const SETUP_TTL_SEC = 10 * 60;
const SETUP_PREFIX = "canvas:setup:";
const TOKEN_PREFIX = "canvas:token:";
const PUBLISHER_TOKENS_PREFIX = "canvas:publisher:tokens:";

export type PublisherTokenMeta = {
  id: string;
  label: string;
  createdAt: string;
};

type StoredToken = {
  publisherEmail: string;
  tokenHash: string;
  label: string;
  createdAt: string;
};

type SetupEntry = {
  publisherEmail: string;
  expiresAt: string;
};

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function parseBearerToken(raw: string): { id: string; secret: string } | null {
  const dot = raw.indexOf(".");
  if (dot <= 0 || dot === raw.length - 1) return null;
  return { id: raw.slice(0, dot), secret: raw.slice(dot + 1) };
}

export function formatPublisherToken(id: string, secret: string): string {
  return `${id}.${secret}`;
}

// ---------- local driver ----------

class LocalTokenStore {
  private dataDir = path.join(process.cwd(), ".data");
  private setupFile = path.join(this.dataDir, "setup-codes.json");
  private tokensFile = path.join(this.dataDir, "publisher-tokens.json");
  private indexFile = path.join(this.dataDir, "publisher-token-index.json");

  private async readJson<T>(file: string, fallback: T): Promise<T> {
    try {
      return JSON.parse(await fs.readFile(file, "utf8"));
    } catch {
      return fallback;
    }
  }

  private async writeJson(file: string, data: unknown): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
    await fs.writeFile(file, JSON.stringify(data, null, 2));
  }

  async mintSetupCode(publisherEmail: string): Promise<{ code: string; expiresAt: string }> {
    const code = nanoid(24);
    const expiresAt = new Date(Date.now() + SETUP_TTL_SEC * 1000).toISOString();
    const codes = await this.readJson<Record<string, SetupEntry>>(this.setupFile, {});
    codes[code] = { publisherEmail, expiresAt };
    await this.writeJson(this.setupFile, codes);
    return { code, expiresAt };
  }

  async exchangeSetupCode(
    code: string,
    label?: string
  ): Promise<{ token: string; tokenId: string; label: string } | null> {
    const codes = await this.readJson<Record<string, SetupEntry>>(this.setupFile, {});
    const entry = codes[code];
    if (!entry) return null;
    if (Date.parse(entry.expiresAt) < Date.now()) {
      delete codes[code];
      await this.writeJson(this.setupFile, codes);
      return null;
    }
    delete codes[code];
    await this.writeJson(this.setupFile, codes);
    return this.mintPublisherToken(entry.publisherEmail, label);
  }

  async mintPublisherToken(
    publisherEmail: string,
    label?: string
  ): Promise<{ token: string; tokenId: string; label: string }> {
    const tokenId = nanoid(16);
    const secret = nanoid(32);
    const tokenLabel = label?.trim() || "Cursor";
    const createdAt = new Date().toISOString();
    const tokens = await this.readJson<Record<string, StoredToken>>(this.tokensFile, {});
    tokens[tokenId] = {
      publisherEmail,
      tokenHash: hashSecret(secret),
      label: tokenLabel,
      createdAt,
    };
    await this.writeJson(this.tokensFile, tokens);
    const index = await this.readJson<Record<string, string[]>>(this.indexFile, {});
    const ids = index[publisherEmail] ?? [];
    if (!ids.includes(tokenId)) {
      index[publisherEmail] = [tokenId, ...ids];
      await this.writeJson(this.indexFile, index);
    }
    return { token: formatPublisherToken(tokenId, secret), tokenId, label: tokenLabel };
  }

  async validateBearerToken(raw: string): Promise<string | null> {
    const parsed = parseBearerToken(raw);
    if (!parsed) return null;
    const tokens = await this.readJson<Record<string, StoredToken>>(this.tokensFile, {});
    const stored = tokens[parsed.id];
    if (!stored || stored.tokenHash !== hashSecret(parsed.secret)) return null;
    return stored.publisherEmail;
  }

  async listTokens(publisherEmail: string): Promise<PublisherTokenMeta[]> {
    const index = await this.readJson<Record<string, string[]>>(this.indexFile, {});
    const tokens = await this.readJson<Record<string, StoredToken>>(this.tokensFile, {});
    return (index[publisherEmail] ?? [])
      .map((id) => {
        const t = tokens[id];
        if (!t) return null;
        return { id, label: t.label, createdAt: t.createdAt };
      })
      .filter((t): t is PublisherTokenMeta => t !== null);
  }

  async revokeToken(publisherEmail: string, tokenId: string): Promise<boolean> {
    const tokens = await this.readJson<Record<string, StoredToken>>(this.tokensFile, {});
    const stored = tokens[tokenId];
    if (!stored || stored.publisherEmail !== publisherEmail) return false;
    delete tokens[tokenId];
    await this.writeJson(this.tokensFile, tokens);
    const index = await this.readJson<Record<string, string[]>>(this.indexFile, {});
    index[publisherEmail] = (index[publisherEmail] ?? []).filter((id) => id !== tokenId);
    await this.writeJson(this.indexFile, index);
    return true;
  }
}

// ---------- redis driver ----------

class RedisTokenStore {
  async mintSetupCode(publisherEmail: string): Promise<{ code: string; expiresAt: string }> {
    const code = nanoid(24);
    const expiresAt = new Date(Date.now() + SETUP_TTL_SEC * 1000).toISOString();
    await getRedis().set(
      `${SETUP_PREFIX}${code}`,
      { publisherEmail, expiresAt },
      { ex: SETUP_TTL_SEC }
    );
    return { code, expiresAt };
  }

  async exchangeSetupCode(
    code: string,
    label?: string
  ): Promise<{ token: string; tokenId: string; label: string } | null> {
    const key = `${SETUP_PREFIX}${code}`;
    const entry = await getRedis().get<SetupEntry>(key);
    if (!entry) return null;
    if (Date.parse(entry.expiresAt) < Date.now()) {
      await getRedis().del(key);
      return null;
    }
    const deleted = await getRedis().del(key);
    if (!deleted) return null;
    return this.mintPublisherToken(entry.publisherEmail, label);
  }

  async mintPublisherToken(
    publisherEmail: string,
    label?: string
  ): Promise<{ token: string; tokenId: string; label: string }> {
    const tokenId = nanoid(16);
    const secret = nanoid(32);
    const tokenLabel = label?.trim() || "Cursor";
    const createdAt = new Date().toISOString();
    await getRedis().set(`${TOKEN_PREFIX}${tokenId}`, {
      publisherEmail,
      tokenHash: hashSecret(secret),
      label: tokenLabel,
      createdAt,
    });
    await getRedis().sadd(`${PUBLISHER_TOKENS_PREFIX}${publisherEmail}`, tokenId);
    return { token: formatPublisherToken(tokenId, secret), tokenId, label: tokenLabel };
  }

  async validateBearerToken(raw: string): Promise<string | null> {
    const parsed = parseBearerToken(raw);
    if (!parsed) return null;
    const stored = await getRedis().get<StoredToken>(`${TOKEN_PREFIX}${parsed.id}`);
    if (!stored || stored.tokenHash !== hashSecret(parsed.secret)) return null;
    return stored.publisherEmail;
  }

  async listTokens(publisherEmail: string): Promise<PublisherTokenMeta[]> {
    const ids = await getRedis().smembers(`${PUBLISHER_TOKENS_PREFIX}${publisherEmail}`);
    const metas: PublisherTokenMeta[] = [];
    for (const id of ids) {
      const t = await getRedis().get<StoredToken>(`${TOKEN_PREFIX}${id}`);
      if (t) metas.push({ id, label: t.label, createdAt: t.createdAt });
    }
    return metas.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  async revokeToken(publisherEmail: string, tokenId: string): Promise<boolean> {
    const stored = await getRedis().get<StoredToken>(`${TOKEN_PREFIX}${tokenId}`);
    if (!stored || stored.publisherEmail !== publisherEmail) return false;
    await getRedis().del(`${TOKEN_PREFIX}${tokenId}`);
    await getRedis().srem(`${PUBLISHER_TOKENS_PREFIX}${publisherEmail}`, tokenId);
    return true;
  }
}

type TokenStoreDriver = LocalTokenStore | RedisTokenStore;

let store: TokenStoreDriver | null = null;

function getTokenStore(): TokenStoreDriver {
  if (!store) {
    store = isVercelStorageConfigured() ? new RedisTokenStore() : new LocalTokenStore();
  }
  return store;
}

export async function mintSetupCode(
  publisherEmail: string
): Promise<{ code: string; expiresAt: string }> {
  return getTokenStore().mintSetupCode(publisherEmail);
}

export async function exchangeSetupCode(
  code: string,
  label?: string
): Promise<{ token: string; tokenId: string; label: string } | null> {
  return getTokenStore().exchangeSetupCode(code, label);
}

export async function validateBearerToken(raw: string): Promise<string | null> {
  return getTokenStore().validateBearerToken(raw);
}

export async function listPublisherTokens(
  publisherEmail: string
): Promise<PublisherTokenMeta[]> {
  return getTokenStore().listTokens(publisherEmail);
}

export async function revokePublisherToken(
  publisherEmail: string,
  tokenId: string
): Promise<boolean> {
  return getTokenStore().revokeToken(publisherEmail, tokenId);
}
