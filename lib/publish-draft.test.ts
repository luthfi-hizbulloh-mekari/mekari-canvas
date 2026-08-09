import { afterEach, describe, expect, it, vi } from "vitest";
import { publishDraft } from "@/lib/publish-draft";

describe("publishDraft", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a Title-only Edit without Artifact fields", async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        slug: "abc12345",
        kind: "md",
        edited: true,
        title: "PR #412 handoff",
        shortLink: "https://canvas.example/s/abc12345",
      })
    );
    vi.stubGlobal("fetch", fetch);

    await publishDraft(null, {
      editSlug: "abc12345",
      editToken: "legacy",
      title: "PR #412 handoff",
    });

    expect(fetch).toHaveBeenCalledOnce();
    const request = fetch.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      editSlug: "abc12345",
      editToken: "legacy",
      title: "PR #412 handoff",
    });
  });

  it("includes Title when creating a text Share", async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        slug: "newshare",
        kind: "md",
        edited: false,
        title: "Release handoff",
        shortLink: "https://canvas.example/s/newshare",
      })
    );
    vi.stubGlobal("fetch", fetch);

    await publishDraft(
      { kind: "md", source: "handoff.md", text: "# Handoff" },
      { title: "Release handoff" }
    );

    const request = fetch.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      kind: "md",
      content: "# Handoff",
      title: "Release handoff",
    });
  });
});
