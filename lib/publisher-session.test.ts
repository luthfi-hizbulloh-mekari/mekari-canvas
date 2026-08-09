import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  devBypassEmail: vi.fn(),
  getSession: vi.fn(),
  validateBearerToken: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));
vi.mock("@/lib/dev-bypass", () => ({
  devBypassEmail: mocks.devBypassEmail,
}));
vi.mock("@/lib/token-store", () => ({
  validateBearerToken: mocks.validateBearerToken,
}));

import { getPublisherEmail, getPublisherIdentity } from "@/lib/publisher-session";

describe("publisher identity resolution", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.devBypassEmail.mockReturnValue(null);
    mocks.getSession.mockResolvedValue(null);
    mocks.validateBearerToken.mockResolvedValue(null);
  });

  it("treats the local development bypass as session-authenticated", async () => {
    mocks.devBypassEmail.mockReturnValue("dev@mekari.com");

    await expect(getPublisherIdentity(new Request("http://localhost"))).resolves.toEqual({
      email: "dev@mekari.com",
      via: "session",
    });
    expect(mocks.validateBearerToken).not.toHaveBeenCalled();
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("identifies a valid Bearer token without re-reading auth in the route", async () => {
    mocks.validateBearerToken.mockResolvedValue("agent@mekari.com");
    const request = new Request("http://localhost", {
      headers: { authorization: "Bearer publisher-token" },
    });

    await expect(getPublisherIdentity(request)).resolves.toEqual({
      email: "agent@mekari.com",
      via: "token",
    });
    expect(mocks.validateBearerToken).toHaveBeenCalledWith("publisher-token");
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("identifies a valid browser session", async () => {
    mocks.getSession.mockResolvedValue({ user: { email: "Browser@Mekari.com" } });

    await expect(getPublisherIdentity(new Request("http://localhost"))).resolves.toEqual({
      email: "browser@mekari.com",
      via: "session",
    });
  });

  it("keeps getPublisherEmail as the email-only compatibility wrapper", async () => {
    mocks.validateBearerToken.mockResolvedValue("agent@mekari.com");
    const request = new Request("http://localhost", {
      headers: { authorization: "Bearer publisher-token" },
    });

    await expect(getPublisherEmail(request)).resolves.toBe("agent@mekari.com");
  });
});
