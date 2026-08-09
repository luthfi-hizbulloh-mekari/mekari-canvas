import { describe, expect, it } from "vitest";
import { parsePublishRequest } from "@/lib/publish-request";

describe("parsePublishRequest", () => {
  it("does not allow text through the trace branch", () => {
    expect(parsePublishRequest({ kind: "trace", content: "hello" })).toEqual({
      ok: false,
      error: "Trace publish requires a valid uploadId",
    });
  });

  it("accepts the staged trace create contract", () => {
    expect(
      parsePublishRequest({
        kind: "trace",
        uploadId: "123456789012345678901",
        title: " checkout flake trace ",
      })
    ).toEqual({
      ok: true,
      value: {
        mode: "create",
        artifact: { kind: "trace", uploadId: "123456789012345678901" },
        title: "checkout flake trace",
      },
    });
  });

  it.each([
    ["html", "<!doctype html><html></html>"],
    ["md", "# Agent notes"],
  ] as const)("accepts the %s Edit contract", (kind, content) => {
    expect(
      parsePublishRequest({ kind, content, editSlug: " abc12345 ", editToken: "legacy" })
    ).toEqual({
      ok: true,
      value: {
        mode: "edit",
        slug: "abc12345",
        artifact: { kind, content },
        editToken: "legacy",
      },
    });
  });

  it("represents omitted, cleared, and set Edit Titles distinctly", () => {
    expect(parsePublishRequest({ editSlug: "abc12345" })).toEqual({
      ok: true,
      value: { mode: "edit", slug: "abc12345" },
    });
    expect(parsePublishRequest({ editSlug: "abc12345", title: "  " })).toEqual({
      ok: true,
      value: { mode: "edit", slug: "abc12345", title: null },
    });
    expect(parsePublishRequest({ editSlug: "abc12345", title: " PR #412 handoff " })).toEqual({
      ok: true,
      value: { mode: "edit", slug: "abc12345", title: "PR #412 handoff" },
    });
  });

  it("rejects create without an Artifact", () => {
    expect(parsePublishRequest({ title: "orphan Title" })).toEqual({
      ok: false,
      error: "Artifact required to create a Share",
    });
  });

  it("rejects Titles longer than 120 Unicode characters after trim", () => {
    expect(
      parsePublishRequest({ kind: "md", content: "hello", title: ` ${"🧪".repeat(121)} ` })
    ).toEqual({
      ok: false,
      error: "Title must be 120 characters or fewer",
    });
  });

  it("rejects an unknown Artifact kind", () => {
    expect(parsePublishRequest({ kind: "zip", content: "hello" })).toEqual({
      ok: false,
      error: "Invalid Artifact kind",
    });
  });

  it("rejects non-string optional Edit fields", () => {
    expect(parsePublishRequest({ kind: "md", content: "hello", editSlug: 123 })).toEqual({
      ok: false,
      error: "Invalid Edit fields",
    });
    expect(parsePublishRequest({ editSlug: "abc12345", title: null })).toEqual({
      ok: false,
      error: "Invalid Edit fields",
    });
  });

});
