---
name: mekari-canvas
description: >-
  Publish and manage Mekari Canvas Shares (HTML, Markdown, or Playwright Trace Artifacts) via the
  Agent API. Use when the user invokes /mekari-canvas, wants to publish a
  handoff doc, list Shares, replace, or delete. Supports shared Publisher API token setup and reuse.
---

# Mekari Canvas

Agent publish for [Mekari Canvas](https://mekari-canvas.vercel.app) — Short links for HTML visualizations, agent-facing Markdown, and Playwright traces.

## When to use

- User says `/mekari-canvas publish` on an attached `.md`, `.html`, or Playwright trace `.zip`
- User wants a Short link for a handoff doc without opening the website
- User asks to list, replace, or delete their Canvas Shares

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
| Publish file (auto-Replace if path known) | `publish <absolute-path>` |
| Force new Share | `publish --new <absolute-path>` |
| Replace specific slug | `replace <absolute-path> <slug>` or `publish --replace <slug> <path>` |
| List Shares | `list` |
| Delete Share | `delete <slug>` |
| Validate/re-run shared token setup | `setup <code>` |

## HTTP API (if scripting manually)

All authenticated calls use `Authorization: Bearer <token>` from `~/.canvas/config.json`.

| Method | Path | Body |
|--------|------|------|
| POST | `/api/publish` | `{ content, kind: "html"\|"md", replaceSlug? }` |
| POST | `/api/trace-uploads` | —; returns `{ uploadId, uploadUrl }` |
| PUT | returned `uploadUrl` | raw ZIP bytes with `Content-Type: application/zip` |
| POST | `/api/publish` | `{ kind: "trace", uploadId, replaceSlug? }` |
| GET | `/api/shares` | — |
| DELETE | `/api/shares/:slug` | — |

Response includes `slug` — Short link is `{apiBase}/s/{slug}`.

Trace publishing is always three steps: mint an upload URL, PUT the ZIP bytes directly, then commit with `uploadId`. Each staged upload is immutable and once-only; mint a fresh upload URL before retrying a failed commit. Never put trace bytes in JSON or base64. Trace Shares expire 30 days after first publish; Replace keeps the original expiration.

## Publish manifest

Maintain `~/.canvas/publish-manifest.json` mapping **absolute file path → slug** so re-publishing the same file auto-Replaces instead of creating duplicates. The script updates this automatically.

## Rules

- **Artifact kind** is immutable on Replace (`.md` → `md`, `.html` → `html`, trace `.zip` → `trace`).
- `.zip` is accepted only when Canvas recognizes Playwright trace structure; arbitrary ZIPs are rejected.
- **Published by** is set at create from the token owner — cannot change on Replace.
- If auto-Replace gets 404 because a trace expired and was swept, remove the path mapping and retry as a new Share. The bundled script does this automatically.
- Return the Short link to the user after publish.
- Legacy Shares without **Published by** are not manageable via Agent API.

## Freeform intent

When the user attaches a handoff `.md` or Playwright trace `.zip` and says "publish this to canvas" without a subcommand, run `publish` on the attached file path.
