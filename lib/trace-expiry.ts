export const TRACE_RETENTION_THRESHOLD_BYTES = 1_000_000;
export const TRACE_RETENTION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

type PreviousTraceMeta = {
  size: number;
  expiresAt?: string;
};

export function isValidTraceSize(size: unknown): size is number {
  return typeof size === "number" && Number.isFinite(size) && size >= 0;
}

/**
 * Applies the complete trace-retention transition for a create or Artifact Edit.
 * Stored expiration is consulted only when both trace sizes are in the same class.
 */
export function decideTraceRetention(
  previous: PreviousTraceMeta | null,
  newSize: number,
  now: string
): string | undefined {
  const newTraceExpires = newSize >= TRACE_RETENTION_THRESHOLD_BYTES;
  const freshExpiresAt = newTraceExpires
    ? new Date(Date.parse(now) + TRACE_RETENTION_DURATION_MS).toISOString()
    : undefined;
  if (!previous) return freshExpiresAt;

  const previousTraceExpires = previous.size >= TRACE_RETENTION_THRESHOLD_BYTES;
  if (previousTraceExpires === newTraceExpires) {
    return previous.expiresAt;
  }

  return freshExpiresAt;
}

export function isExpired(meta: { expiresAt?: string }, now = Date.now()): boolean {
  return typeof meta.expiresAt === "string" && Date.parse(meta.expiresAt) <= now;
}
