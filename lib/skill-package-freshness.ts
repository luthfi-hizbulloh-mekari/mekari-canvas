import { SKILL_REFRESH_STEPS } from "@/lib/skill-distribution";

export const CURRENT_SKILL_PACKAGE_VERSION = "1.0.0";
export const MINIMUM_SKILL_PACKAGE_VERSION = "1.0.0";

export type SkillPackageVerdict =
  | { status: "ok" }
  | { status: "warn"; warning: string }
  | { status: "block"; error: string; code: "skill_package_stale" };

const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
type SkillPackageVersion = readonly [number, number, number];

function parseSkillPackageVersion(raw: string | null): SkillPackageVersion | null {
  if (!raw || !VERSION_PATTERN.test(raw)) return null;
  const [major, minor, patch] = raw.split(".").map(Number);
  return [major, minor, patch];
}

function compareParsedVersions(
  left: SkillPackageVersion,
  right: SkillPackageVersion
): number {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  }
  return 0;
}

export function compareSkillPackageVersions(left: string, right: string): number | null {
  const parsedLeft = parseSkillPackageVersion(left);
  const parsedRight = parseSkillPackageVersion(right);
  return parsedLeft && parsedRight ? compareParsedVersions(parsedLeft, parsedRight) : null;
}

function refreshMessage(reason: string): string {
  return `${reason}\n\nRefresh the Mekari Canvas Skill package, then retry:\n${SKILL_REFRESH_STEPS}`;
}

const RETIRED_REPLACE_SLUG_ERROR = refreshMessage(
  "replaceSlug is retired and rejected because it can silently create a new Share. Use editSlug to Edit an existing Share."
);

export function checkSkillPackage(
  input: {
    via: "session" | "token";
    version: string | null;
    breaking: boolean;
    hasRetiredReplaceSlug: boolean;
  },
  versions = {
    current: CURRENT_SKILL_PACKAGE_VERSION,
    minimum: MINIMUM_SKILL_PACKAGE_VERSION,
  }
): SkillPackageVerdict {
  if (input.via === "session") return { status: "ok" };
  if (input.hasRetiredReplaceSlug) {
    return {
      status: "block",
      error: RETIRED_REPLACE_SLUG_ERROR,
      code: "skill_package_stale",
    };
  }

  const version = parseSkillPackageVersion(input.version);
  const minimum = parseSkillPackageVersion(versions.minimum);
  const current = parseSkillPackageVersion(versions.current);
  if (!minimum || !current) return { status: "ok" };

  if (input.breaking && (!version || compareParsedVersions(version, minimum) < 0)) {
    return {
      status: "block",
      error: refreshMessage(
        `This operation requires Mekari Canvas Skill package ${versions.minimum} or newer.`
      ),
      code: "skill_package_stale",
    };
  }

  if (!version || compareParsedVersions(version, current) < 0) {
    return {
      status: "warn",
      warning: refreshMessage(
        `A newer Mekari Canvas Skill package (${versions.current}) is available.`
      ),
    };
  }

  return { status: "ok" };
}
