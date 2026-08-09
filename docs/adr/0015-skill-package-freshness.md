# Enforce Skill package freshness at the Agent API

The Mekari Canvas Skill package declares its semver in `SKILL.md` frontmatter. The Canvas deployment owns Current and Minimum Skill package versions and drift-tests Current against that declaration. Agent publish clients send the version in `X-Mekari-Canvas-Skill-Version` on every authenticated API call.

Freshness enforcement is server-only and applies only to Publisher API Bearer-token requests. Session-authenticated browser publishing, including Edit and Playwright Trace publishing, bypasses the gate. `/api/publish` warns every non-blocked client below Current in a successful `skillPackageWarning` field; text creates also warn when the version is missing or unrecognized. Breaking operations block missing, unrecognized, and below-Minimum versions with HTTP 400 and `code: "skill_package_stale"`; breaking operations are Edit, Playwright Trace publish/upload, and any request containing the retired `replaceSlug` field. The retired field is always rejected for token clients so it cannot silently create a new Share.

The error and warning text points Publishers to the standard Skills CLI update or upgrade commands, with the canonical global Add command as fallback. The command text remains centralized with the existing Skill distribution constants.

**Frontmatter compatibility verification:** on 2026-08-10, Skills CLI 1.5.22 validated this package with `version: 1.0.0` and completed a non-interactive copied installation targeting `cursor`, `claude-code`, and `codex`. Its installation summary identified all three target surfaces and produced the shared `.agents` copy plus the Claude-specific copy without rejecting or dropping the versioned `SKILL.md` metadata.

**Why not docs-only or Skills-CLI-only?** Documentation cannot prevent a legacy request from silently creating a new Share, and package installation state is not authoritative at request time. The Agent API has both the authenticated client identity and the operation semantics needed to apply the compatibility policy.

**Why no client preflight or public freshness endpoint?** The server evaluates the next mutating request authoritatively. A preflight would duplicate semver and policy logic in Bash, add a network round trip, and create a second public version contract next to the unrelated setup-manifest version.
