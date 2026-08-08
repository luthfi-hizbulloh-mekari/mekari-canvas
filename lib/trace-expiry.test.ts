import { describe, expect, it } from "vitest";
import {
  decideTraceRetention,
  isExpired,
  isValidTraceSize,
  TRACE_RETENTION_DURATION_MS,
  TRACE_RETENTION_THRESHOLD_BYTES,
} from "@/lib/trace-expiry";

const now = "2026-08-05T00:00:00.000Z";
const sevenDaysLater = "2026-08-12T00:00:00.000Z";

describe("trace retention", () => {
  it.each([
    [TRACE_RETENTION_THRESHOLD_BYTES - 1, undefined],
    [TRACE_RETENTION_THRESHOLD_BYTES, sevenDaysLater],
    [TRACE_RETENTION_THRESHOLD_BYTES + 1, sevenDaysLater],
  ])("classifies a new %i-byte trace", (size, expiresAt) => {
    expect(decideTraceRetention(null, size, now)).toBe(expiresAt);
  });

  it("uses an exact seven-day retention duration", () => {
    const expiresAt = decideTraceRetention(null, TRACE_RETENTION_THRESHOLD_BYTES, now);
    expect(expiresAt).toBe(sevenDaysLater);
    expect(Date.parse(expiresAt!) - Date.parse(now)).toBe(
      TRACE_RETENTION_DURATION_MS
    );
  });

  it("preserves same-class expiration verbatim, including a legacy deadline", () => {
    const legacyThirtyDayExpiry = "2026-09-04T00:00:00.000Z";
    expect(
      decideTraceRetention(
        { size: TRACE_RETENTION_THRESHOLD_BYTES - 1, expiresAt: legacyThirtyDayExpiry },
        TRACE_RETENTION_THRESHOLD_BYTES - 2,
        now
      )
    ).toBe(legacyThirtyDayExpiry);
    expect(
      decideTraceRetention(
        { size: TRACE_RETENTION_THRESHOLD_BYTES, expiresAt: legacyThirtyDayExpiry },
        TRACE_RETENTION_THRESHOLD_BYTES + 1,
        now
      )
    ).toBe(legacyThirtyDayExpiry);
  });

  it("clears expiration when a large trace becomes small", () => {
    expect(
      decideTraceRetention(
        { size: TRACE_RETENTION_THRESHOLD_BYTES, expiresAt: sevenDaysLater },
        TRACE_RETENTION_THRESHOLD_BYTES - 1,
        now
      )
    ).toBeUndefined();
  });

  it("sets a new seven-day expiration when a small trace becomes large", () => {
    expect(
      decideTraceRetention(
        { size: TRACE_RETENTION_THRESHOLD_BYTES - 1 },
        TRACE_RETENTION_THRESHOLD_BYTES,
        now
      )
    ).toBe(sevenDaysLater);
  });

  it.each([undefined, Number.NaN, Number.POSITIVE_INFINITY, -1])(
    "rejects invalid previous size %s",
    (size) => {
      expect(isValidTraceSize(size)).toBe(false);
    }
  );

  it.each([0, TRACE_RETENTION_THRESHOLD_BYTES, Number.MAX_SAFE_INTEGER])(
    "accepts valid trace size %s",
    (size) => {
      expect(isValidTraceSize(size)).toBe(true);
    }
  );

  it("counts the exact expiration instant as expired", () => {
    const expiresAt = "2026-09-04T00:00:00.000Z";
    expect(isExpired({ expiresAt }, Date.parse(expiresAt) - 1)).toBe(false);
    expect(isExpired({ expiresAt }, Date.parse(expiresAt))).toBe(true);
  });

  it("keeps permanent Shares live", () => {
    expect(isExpired({}, Date.now())).toBe(false);
  });
});
