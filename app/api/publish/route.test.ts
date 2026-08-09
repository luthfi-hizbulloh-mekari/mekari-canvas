import { beforeEach, describe, expect, it, vi } from "vitest";
import { CURRENT_SKILL_PACKAGE_VERSION } from "@/lib/skill-package-freshness";

const mocks = vi.hoisted(() => ({
  getPublisherIdentity: vi.fn(),
  publishShare: vi.fn(),
}));

vi.mock("@/lib/publisher-session", () => ({
  getPublisherIdentity: mocks.getPublisherIdentity,
}));
vi.mock("@/lib/publish-share", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/publish-share")>(),
  publishShare: mocks.publishShare,
}));

import { POST } from "@/app/api/publish/route";

const publisherEmail = "publisher@mekari.com";

function request(body: Record<string, unknown>, version?: string) {
  const headers = new Headers({
    authorization: "Bearer test-token",
    "content-type": "application/json",
  });
  if (version) headers.set("x-mekari-canvas-skill-version", version);
  return new Request("https://canvas.example/api/publish", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/publish Skill package freshness", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getPublisherIdentity.mockResolvedValue({ email: publisherEmail, via: "token" });
    mocks.publishShare.mockResolvedValue({
      slug: "abc12345",
      edited: false,
      kind: "md",
      publishedBy: publisherEmail,
    });
  });

  it("blocks legacy replaceSlug before parsing and creates no Share", async () => {
    const response = await POST(request({
      kind: "md",
      content: "# Handoff",
      replaceSlug: "oldshare",
    }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ code: "skill_package_stale" });
    expect(body.error).toContain("replaceSlug");
    expect(mocks.publishShare).not.toHaveBeenCalled();
  });

  it.each([
    ["Edit", { editSlug: "abc12345", title: "New title" }],
    ["trace publish", { kind: "trace", uploadId: "123456789012345678901" }],
  ] as const)("blocks a legacy Bearer client on %s", async (_label, body) => {
    const response = await POST(request(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "skill_package_stale" });
    expect(mocks.publishShare).not.toHaveBeenCalled();
  });

  it("allows a legacy Bearer client to create a text Share", async () => {
    const response = await POST(request({ kind: "html", content: "<html>ok</html>" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.skillPackageWarning).toContain("npx skills update");
    expect(mocks.publishShare).toHaveBeenCalledWith(
      { mode: "create", artifact: { kind: "html", content: "<html>ok</html>" } },
      publisherEmail
    );
  });

  it.each([
    [
      { editSlug: "abc12345", title: "Browser Edit" },
      { mode: "edit", slug: "abc12345", title: "Browser Edit" },
    ],
    [
      { kind: "trace", uploadId: "123456789012345678901" },
      {
        mode: "create",
        artifact: { kind: "trace", uploadId: "123456789012345678901" },
      },
    ],
  ] as const)("bypasses freshness for a session-authenticated request", async (body, parsed) => {
    mocks.getPublisherIdentity.mockResolvedValue({ email: publisherEmail, via: "session" });

    const response = await POST(request(body));

    expect(response.status).toBe(200);
    expect(mocks.publishShare).toHaveBeenCalledWith(parsed, publisherEmail);
  });

  it("allows a current Bearer client to Edit", async () => {
    const response = await POST(request(
      { editSlug: "abc12345", title: "Current client" },
      CURRENT_SKILL_PACKAGE_VERSION
    ));

    expect(response.status).toBe(200);
    expect(mocks.publishShare).toHaveBeenCalledOnce();
  });
});
