import { describe, expect, it } from "vitest";
import { isExpired, traceExpiresAt, TRACE_TTL_DAYS } from "@/lib/trace-expiry";

describe("trace expiration", () => {
  it("is 30 days from first publish", () => {
    const createdAt = "2026-08-05T00:00:00.000Z";
    expect(Date.parse(traceExpiresAt(createdAt)) - Date.parse(createdAt)).toBe(
      TRACE_TTL_DAYS * 24 * 60 * 60 * 1000
    );
  });

  it("counts the exact expiration instant as expired", () => {
    const expiresAt = "2026-09-04T00:00:00.000Z";
    expect(isExpired({ expiresAt }, Date.parse(expiresAt) - 1)).toBe(false);
    expect(isExpired({ expiresAt }, Date.parse(expiresAt))).toBe(true);
  });

  it("keeps permanent Shares live", () => {
    expect(isExpired({}, Date.now())).toBe(false);
  });
});
