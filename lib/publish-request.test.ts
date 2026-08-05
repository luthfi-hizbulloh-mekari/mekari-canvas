import { describe, expect, it } from "vitest";
import { parsePublishRequest } from "@/lib/publish-request";

describe("parsePublishRequest", () => {
  it("does not allow text through the trace branch", () => {
    expect(parsePublishRequest({ kind: "trace", content: "hello" })).toEqual({
      ok: false,
      error: "Trace publish requires a valid uploadId",
    });
  });

  it("accepts the staged trace commit contract", () => {
    expect(
      parsePublishRequest({ kind: "trace", uploadId: "123456789012345678901" })
    ).toMatchObject({ ok: true, value: { kind: "trace" } });
  });

  it.each([
    ["html", "<!doctype html><html></html>"],
    ["md", "# Agent notes"],
  ] as const)("accepts the %s text contract", (kind, content) => {
    expect(
      parsePublishRequest({ kind, content, replaceSlug: "abc12345", editToken: "legacy" })
    ).toEqual({
      ok: true,
      value: { kind, content, replaceSlug: "abc12345", editToken: "legacy" },
    });
  });

  it("rejects an unknown Artifact kind", () => {
    expect(parsePublishRequest({ kind: "zip", content: "hello" })).toEqual({
      ok: false,
      error: "Invalid Artifact kind",
    });
  });

  it("rejects non-string optional Replace fields", () => {
    expect(parsePublishRequest({ kind: "md", content: "hello", replaceSlug: 123 })).toEqual({
      ok: false,
      error: "Invalid Replace fields",
    });
  });
});
