import { describe, expect, it } from "vitest";
import { ARTIFACT_KIND } from "@/lib/artifact-kind";
import { checkDraft, type Draft } from "@/lib/draft";

function traceDraft(size: number): Draft {
  return {
    kind: "trace",
    source: "trace.zip",
    file: { size } as File,
  };
}

describe("checkDraft", () => {
  it("keeps the 500 KB text cap and label", () => {
    const draft: Draft = {
      kind: "md",
      source: "large.md",
      text: "x".repeat(ARTIFACT_KIND.md.maxBytes + 1),
    };
    expect(checkDraft(draft)).toEqual({
      ok: false,
      bytes: ARTIFACT_KIND.md.maxBytes + 1,
      label: "× over 500kb",
    });
  });

  it("uses the separate 50 MB trace cap and label", () => {
    expect(checkDraft(traceDraft(ARTIFACT_KIND.trace.maxBytes + 1))).toEqual({
      ok: false,
      bytes: ARTIFACT_KIND.trace.maxBytes + 1,
      label: "× over 50mb",
    });
  });

  it("reports text validity and trace upload readiness", () => {
    expect(
      checkDraft({ kind: "html", source: "page.html", text: "<!doctype html><html></html>" })
    ).toMatchObject({ ok: true, label: "✓ valid" });
    expect(checkDraft(traceDraft(1024))).toEqual({ ok: true, bytes: 1024, label: "✓ ready" });
  });
});
