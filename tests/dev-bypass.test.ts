import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { devBypassEmail } from "@/lib/dev-bypass";

const ENV_KEYS = ["DEV_AUTH_BYPASS", "DEV_PUBLISHER_EMAIL", "VERCEL"] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

afterAll(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("devBypassEmail", () => {
  it("returns null when bypass is off", () => {
    process.env.DEV_PUBLISHER_EMAIL = "publisher@mekari.com";

    expect(devBypassEmail()).toBeNull();
  });

  it("returns a valid Mekari email when bypass is on", () => {
    process.env.DEV_AUTH_BYPASS = "true";
    process.env.DEV_PUBLISHER_EMAIL = "Publisher@Mekari.com";

    expect(devBypassEmail()).toBe("publisher@mekari.com");
  });

  it("returns null for a non-Mekari email", () => {
    process.env.DEV_AUTH_BYPASS = "true";
    process.env.DEV_PUBLISHER_EMAIL = "publisher@example.com";

    expect(devBypassEmail()).toBeNull();
  });

  it("returns null for an empty email", () => {
    process.env.DEV_AUTH_BYPASS = "true";
    process.env.DEV_PUBLISHER_EMAIL = "   ";

    expect(devBypassEmail()).toBeNull();
  });

  it("returns null on Vercel even when bypass is fully configured", () => {
    process.env.DEV_AUTH_BYPASS = "true";
    process.env.DEV_PUBLISHER_EMAIL = "publisher@mekari.com";
    process.env.VERCEL = "1";

    expect(devBypassEmail()).toBeNull();
  });
});
