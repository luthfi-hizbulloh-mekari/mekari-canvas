---
name: mekari-canvas
version: 1.0.0
description: >-
  Publish and manage Mekari Canvas Shares (HTML, Markdown, or Playwright Trace Artifacts) via the
  Agent API. Use when the user invokes /mekari-canvas, wants to publish a
  handoff doc, list Shares, edit, or delete. Supports shared Publisher API token setup and reuse.
---

# Mekari Canvas

Agent publish for [Mekari Canvas](https://mekari-canvas.vercel.app) — Short links for HTML visualizations, agent-facing Markdown, and Playwright traces.

## When to use

- User says `/mekari-canvas publish` on an attached `.md`, `.html`, or Playwright trace `.zip`
- User wants a Short link for a handoff doc without opening the website
- User asks to list, edit, or delete their Canvas Shares

## Setup and refresh

Install or refresh this Skill package globally for all supported Agent surfaces with:

```bash
npx skills add https://github.com/luthfi-hizbulloh-mekari/mekari-canvas --skill mekari-canvas --global --agent cursor --agent claude-code --agent codex --yes
```

Then, from this installed Skill directory, run `bash scripts/mekari-canvas.sh setup <code>`. Do not assume an Agent-specific install path or a `mekari-canvas` executable on `PATH`.

The setup command validates a token already stored in `~/.canvas/config.json`. Preserve a valid token. Exchange the new Setup code only when credentials are missing or the API rejects the token. If validation fails because of DNS, timeout, or another transport problem, preserve the token and report that it could not be validated. Preserve unrelated config fields and keep the config mode at 600.

Do not download, copy, or overwrite Skill package files during token setup. The Skills CLI exclusively owns managed Skill installation and refresh for Cursor, Claude Code, and Codex CLI.

## Subcommands

Prefer the bundled script when shell is available:

```bash
bash scripts/mekari-canvas.sh <command> [args]
```

Resolve the path relative to this installed Skill directory.

| Intent | Command |
|--------|---------|
| Publish file (auto-Edit if path known) | `publish --title <title> <absolute-path>` |
| Force new Share | `publish --new --title <title> <absolute-path>` |
| Edit Title and/or Artifact | `edit <slug> [--title <title>] [<absolute-path>]` |
| List Shares | `list` |
| Delete Share | `delete <slug>` |
| Validate/re-run shared token setup | `setup <code>` |

## HTTP API (if scripting manually)

All authenticated calls use `Authorization: Bearer <token>` from `~/.canvas/config.json` and send this package's frontmatter version as `X-Mekari-Canvas-Skill-Version`.

| Method | Path | Body |
|--------|------|------|
| POST | `/api/publish` | `{ content, kind: "html"\|"md", title?, editSlug? }` |
| POST | `/api/trace-uploads` | —; returns `{ uploadId, uploadUrl }` |
| PUT | returned `uploadUrl` | raw ZIP bytes with `Content-Type: application/zip` |
| POST | `/api/publish` | `{ kind: "trace", uploadId, title?, editSlug? }` |
| POST | `/api/publish` | `{ editSlug, title }` for Title-only Edit |
| GET | `/api/shares` | — |
| DELETE | `/api/shares/:slug` | — |

Response includes `slug` and optional `title` — Short link is `{apiBase}/s/{slug}`.

Canvas returns HTTP 200 with `skillPackageWarning` on any non-blocked publish below the current version; text creates also warn when the Skill package version is missing or unrecognized. A breaking publish or trace-upload operation from a missing, unrecognized, or below-minimum version returns HTTP 400 with `code: "skill_package_stale"` and Skill refresh steps. Refresh with `npx skills update` or `npx skills upgrade`; if necessary, use the full Add command in **Setup and refresh**.

Trace publishing is always three steps: mint an upload URL, PUT the ZIP bytes directly, then commit with `uploadId`. Each staged upload is immutable and once-only; mint a fresh upload URL before retrying a failed commit. Send trace bytes as the raw PUT body. Final validated traces smaller than exactly 1,000,000 bytes have no automatic expiration; traces at or above 1,000,000 bytes expire 168 hours after a successful publish commit. On Edit, the same size class preserves any existing expiration, large → small clears it, and small → large sets a new seven-day deadline from the Artifact overwrite commit.

## Publish manifest

Maintain `~/.canvas/publish-manifest.json` mapping **absolute file path → slug** so re-publishing the same Artifact auto-Edits the Share instead of creating duplicates. The script updates this automatically. When an auto-Edit omits `--title`, preserve the existing Title.

## Rules

- Before creating a Share, derive and supply a **Title** from the Artifact purpose: about 3–8 words and under 120 characters (for example, `PR #412 handoff` or `checkout flake trace`). A publish is complete when the command returns the Short link.
- **Artifact kind** is immutable on Edit (`.md` → `md`, `.html` → `html`, trace `.zip` → `trace`).
- `.zip` is accepted only when Canvas recognizes Playwright trace structure; arbitrary ZIPs are rejected.
- **Published by** is set at create from the token owner and remains unchanged on Edit.
- `replaceSlug` is retired and rejected. Use `editSlug`; a retired target is never treated as a create.
- If an Artifact-backed auto-Edit gets 404 because a trace expired and was swept, remove the path mapping and retry as a new Share. A Title-only Edit returns the server error.
- Return the Short link to the user after publish.
- Legacy Shares without **Published by** are not manageable via Agent API.

## Freeform intent

When the user attaches a handoff `.md` or Playwright trace `.zip` and says "publish this to canvas" without a subcommand, derive its Title and run `publish --title <title>` on the attached Artifact path.
