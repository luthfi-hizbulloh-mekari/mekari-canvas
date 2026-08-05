export const TRACE_TTL_DAYS = 30;

export function traceExpiresAt(createdAt: string): string {
  return new Date(Date.parse(createdAt) + TRACE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export function isExpired(meta: { expiresAt?: string }, now = Date.now()): boolean {
  return typeof meta.expiresAt === "string" && Date.parse(meta.expiresAt) <= now;
}
