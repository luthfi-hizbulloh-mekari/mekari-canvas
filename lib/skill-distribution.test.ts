import { describe, expect, it } from "vitest";
import {
  buildSetupPrompt,
  isSkillSetupUsable,
  MEKARI_CANVAS_INSTALL_COMMAND,
  parseSkillSetup,
  type SkillSetup,
} from "@/lib/skill-distribution";

const setup: SkillSetup = {
  code: "preview-code",
  expiresAt: "2030-01-01T00:10:00.000Z",
  manifestUrl: "https://preview.example/setup/manifest.json",
  guideUrl: "https://preview.example/setup/guide.md",
};

describe("skill distribution setup", () => {
  it("builds a global install prompt around the bundled setup script", () => {
    const prompt = buildSetupPrompt(setup);

    expect(prompt).toContain(MEKARI_CANVAS_INSTALL_COMMAND);
    expect(prompt).toContain(
      "bash scripts/mekari-canvas.sh setup 'preview-code' 'https://preview.example/setup/manifest.json'"
    );
    expect(prompt).toContain("Guide: https://preview.example/setup/guide.md");
    expect(prompt).not.toContain("mekari-canvas setup preview-code");
  });

  it("shell-quotes server-provided setup values", () => {
    const prompt = buildSetupPrompt({
      ...setup,
      code: "code'with-quote",
      manifestUrl: "https://preview.example/setup/manifest.json?ref=a'b",
    });

    expect(prompt).toContain(`'code'"'"'with-quote'`);
    expect(prompt).toContain(`'https://preview.example/setup/manifest.json?ref=a'"'"'b'`);
  });

  it("parses the API response at an explicit runtime boundary", () => {
    expect(parseSkillSetup(setup)).toEqual(setup);
    expect(() => parseSkillSetup({ ...setup, expiresAt: "never" })).toThrow(
      "Invalid Setup code response"
    );
    expect(() => parseSkillSetup({ ...setup, guideUrl: "file:///tmp/guide.md" })).toThrow(
      "Invalid Setup code response"
    );
  });

  it("stops reusing a code shortly before server expiry", () => {
    const expiry = Date.parse(setup.expiresAt);

    expect(isSkillSetupUsable(setup, expiry - 15_001)).toBe(true);
    expect(isSkillSetupUsable(setup, expiry - 15_000)).toBe(false);
  });
});
