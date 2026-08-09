export const MEKARI_CANVAS_INSTALL_COMMAND =
  "npx skills add https://github.com/luthfi-hizbulloh-mekari/mekari-canvas --skill mekari-canvas --global --agent cursor --agent claude-code --agent codex --yes";

export const SKILL_REFRESH_STEPS = [
  "npx skills update",
  "# or",
  "npx skills upgrade",
  "",
  "If updating does not refresh the package, reinstall it:",
  MEKARI_CANVAS_INSTALL_COMMAND,
].join("\n");

export type SkillSetup = {
  code: string;
  expiresAt: string;
  manifestUrl: string;
  guideUrl: string;
};

const SETUP_EXPIRY_SAFETY_WINDOW_MS = 15_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requiredString(
  value: Record<string, unknown>,
  key: keyof SkillSetup
): string {
  const field = value[key];
  if (typeof field !== "string" || !field) {
    throw new Error("Invalid Setup code response");
  }
  return field;
}

function requiredHttpUrl(value: Record<string, unknown>, key: "manifestUrl" | "guideUrl") {
  const field = requiredString(value, key);
  let url: URL;
  try {
    url = new URL(field);
  } catch {
    throw new Error("Invalid Setup code response");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Invalid Setup code response");
  }
  return url.toString();
}

export function parseSkillSetup(value: unknown): SkillSetup {
  if (!isRecord(value)) throw new Error("Invalid Setup code response");

  const expiresAt = requiredString(value, "expiresAt");
  if (!Number.isFinite(Date.parse(expiresAt))) {
    throw new Error("Invalid Setup code response");
  }

  return {
    code: requiredString(value, "code"),
    expiresAt,
    manifestUrl: requiredHttpUrl(value, "manifestUrl"),
    guideUrl: requiredHttpUrl(value, "guideUrl"),
  };
}

export function skillSetupRemainingMs(setup: SkillSetup, now = Date.now()): number {
  return Date.parse(setup.expiresAt) - SETUP_EXPIRY_SAFETY_WINDOW_MS - now;
}

export function isSkillSetupUsable(setup: SkillSetup, now = Date.now()): boolean {
  return skillSetupRemainingMs(setup, now) > 0;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export function buildSetupPrompt(setup: SkillSetup): string {
  return [
    "Install or refresh the Mekari Canvas skill globally for Cursor, Claude Code and Codex CLI.",
    "",
    "1. Install/refresh the skill package (Skills CLI owns this):",
    `   ${MEKARI_CANVAS_INSTALL_COMMAND}`,
    "",
    "2. In the newly installed mekari-canvas skill directory, run its bundled setup helper:",
    `   bash scripts/mekari-canvas.sh setup ${shellQuote(setup.code)} ${shellQuote(setup.manifestUrl)}`,
    "",
    "The selected destination only decides where this prompt opens. Installation is global",
    "for all three agents. Token setup preserves valid credentials and unrelated config fields.",
    "",
    `Guide: ${setup.guideUrl}`,
  ].join("\n");
}
