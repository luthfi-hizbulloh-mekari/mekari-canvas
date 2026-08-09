import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CURRENT_SKILL_PACKAGE_VERSION,
  MINIMUM_SKILL_PACKAGE_VERSION,
  checkSkillPackage,
  compareSkillPackageVersions,
} from "@/lib/skill-package-freshness";

describe("compareSkillPackageVersions", () => {
  it.each([
    ["1.0.0", "1.0.0", 0],
    ["1.0.1", "1.0.0", 1],
    ["1.2.0", "1.10.0", -1],
    ["2.0.0", "1.99.99", 1],
  ] as const)("compares %s with %s", (left, right, expected) => {
    expect(compareSkillPackageVersions(left, right)).toBe(expected);
  });

  it.each(["", "1", "1.0", "v1.0.0", "1.0.0-beta", "1.0.x"])(
    "returns null for unrecognized version %s",
    (version) => {
      expect(compareSkillPackageVersions(version, "1.0.0")).toBeNull();
      expect(compareSkillPackageVersions("1.0.0", version)).toBeNull();
    }
  );
});

describe("checkSkillPackage", () => {
  it("bypasses session-authenticated browser requests", () => {
    expect(checkSkillPackage({
      via: "session",
      version: null,
      breaking: true,
      hasRetiredReplaceSlug: true,
    })).toEqual({ status: "ok" });
  });

  it("accepts a current token client", () => {
    expect(checkSkillPackage({
      via: "token",
      version: CURRENT_SKILL_PACKAGE_VERSION,
      breaking: true,
      hasRetiredReplaceSlug: false,
    })).toEqual({ status: "ok" });
  });

  it.each([false, true])(
    "warns a compatible token client below Current (breaking: %s)",
    (breaking) => {
      const verdict = checkSkillPackage({
        via: "token",
        version: "1.1.0",
        breaking,
        hasRetiredReplaceSlug: false,
      }, { minimum: "1.0.0", current: "2.0.0" });

      expect(verdict).toMatchObject({ status: "warn" });
      expect(verdict.status === "warn" && verdict.warning).toContain("2.0.0");
    }
  );

  it.each([
    ["0.9.9", "below Minimum"],
    [null, "missing"],
    ["not-semver", "unparseable"],
  ] as const)("blocks %s on a breaking token operation (%s)", (version, _reason) => {
    const verdict = checkSkillPackage({
      via: "token",
      version,
      breaking: true,
      hasRetiredReplaceSlug: false,
    });

    expect(verdict).toMatchObject({ status: "block", code: "skill_package_stale" });
    expect(verdict.status === "block" && verdict.error).toContain("npx skills update");
  });

  it("blocks replaceSlug even at the current version", () => {
    const verdict = checkSkillPackage({
      via: "token",
      version: CURRENT_SKILL_PACKAGE_VERSION,
      breaking: false,
      hasRetiredReplaceSlug: true,
    });

    expect(verdict).toMatchObject({ status: "block", code: "skill_package_stale" });
    expect(verdict.status === "block" && verdict.error).toContain("replaceSlug");
  });

  it.each([
    [null, "missing"],
    ["not-semver", "unrecognized"],
    ["0.9.9", "below Minimum"],
  ] as const)("warns a soft token client with a %s version (%s)", (version, _reason) => {
    const verdict = checkSkillPackage({
      via: "token",
      version,
      breaking: false,
      hasRetiredReplaceSlug: false,
    });

    expect(verdict).toMatchObject({ status: "warn" });
    expect(verdict.status === "warn" && verdict.warning).toContain("npx skills update");
  });

  it("keeps Minimum at or below Current", () => {
    expect(compareSkillPackageVersions(
      MINIMUM_SKILL_PACKAGE_VERSION,
      CURRENT_SKILL_PACKAGE_VERSION
    )).not.toBe(1);
  });
});

describe("Skill package version declaration", () => {
  it("keeps the Canvas Current version aligned with SKILL.md frontmatter", async () => {
    const skill = await readFile(
      path.resolve("public/setup/skill/SKILL.md"),
      "utf8"
    );
    const frontmatter = skill.match(/^---\n([\s\S]*?)\n---/);
    const declared = frontmatter?.[1].match(/^version:\s*(\S+)\s*$/m)?.[1];

    expect(declared).toBe(CURRENT_SKILL_PACKAGE_VERSION);
  });
});
