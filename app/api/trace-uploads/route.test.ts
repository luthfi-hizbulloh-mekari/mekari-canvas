import { beforeEach, describe, expect, it, vi } from "vitest";
import { CURRENT_SKILL_PACKAGE_VERSION } from "@/lib/skill-package-freshness";

const mocks = vi.hoisted(() => ({
  createTraceUpload: vi.fn(),
  getPublisherIdentity: vi.fn(),
}));

vi.mock("@/lib/publisher-session", () => ({
  getPublisherIdentity: mocks.getPublisherIdentity,
}));
vi.mock("@/lib/storage", () => ({
  getStorage: () => ({ createTraceUpload: mocks.createTraceUpload }),
}));

import { POST } from "@/app/api/trace-uploads/route";

function request(version?: string) {
  const headers = new Headers({ authorization: "Bearer test-token" });
  if (version) headers.set("x-mekari-canvas-skill-version", version);
  return new Request("https://canvas.example/api/trace-uploads", {
    method: "POST",
    headers,
  });
}

describe("POST /api/trace-uploads Skill package freshness", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getPublisherIdentity.mockResolvedValue({
      email: "publisher@mekari.com",
      via: "token",
    });
    mocks.createTraceUpload.mockResolvedValue("https://blob.example/upload");
  });

  it("blocks a legacy Bearer client before minting an upload", async () => {
    const response = await POST(request());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "skill_package_stale" });
    expect(mocks.createTraceUpload).not.toHaveBeenCalled();
  });

  it("allows a current Bearer client to mint an upload", async () => {
    const response = await POST(request(CURRENT_SKILL_PACKAGE_VERSION));

    expect(response.status).toBe(200);
    expect(mocks.createTraceUpload).toHaveBeenCalledOnce();
  });

  it("allows a session-authenticated browser request without a version", async () => {
    mocks.getPublisherIdentity.mockResolvedValue({
      email: "publisher@mekari.com",
      via: "session",
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.createTraceUpload).toHaveBeenCalledOnce();
  });
});
