---
name: mekari-canvas
description: >-
  Publish and manage Mekari Canvas Shares (HTML, Markdown, or Playwright Trace Artifacts) via the
  Agent API. Use when the user invokes /mekari-canvas, wants to publish a
  handoff doc, list Shares, replace, or delete. Supports setup on first use.
---

# Mekari Canvas

Agent publish for [Mekari Canvas](https://mekari-canvas.vercel.app) — Short links for HTML visualizations, agent-facing Markdown, and Playwright traces.

## When to use

- User says `/mekari-canvas publish` on an attached `.md`, `.html`, or Playwright trace `.zip`
- User wants a Short link for a handoff doc without opening the website
- User asks to list, replace, or delete their Canvas Shares

## Setup (one-time)

If `~/.canvas/config.json` is missing:

1. Ask the user to click **Add skill** on the Canvas homepage and share the **Setup code** (or use the copy-paste block with manifest URL + code).
2. Fetch the setup manifest from the URL they provide (default: `https://mekari-canvas.vercel.app/setup/manifest.json`).
3. Download each file in `manifest.files[]` to `~/.cursor/skills/mekari-canvas/` preserving relative paths.
4. `POST {apiBase}{exchangeUrl}` with `{ "code": "<setup-code>", "label": "Cursor" }`.
5. Write `~/.canvas/config.json`: `{ "apiBase": "<from response>", "token": "<from response>" }` (mode 600).
6. Confirm with `~/.cursor/skills/mekari-canvas/scripts/mekari-canvas.sh list`.

Or run: `~/.cursor/skills/mekari-canvas/scripts/mekari-canvas.sh setup <code> [manifest-url]`

## Subcommands

Prefer the bundled script when shell is available:

```bash
~/.cursor/skills/mekari-canvas/scripts/mekari-canvas.sh <command> [args]
```

| Intent | Command |
|--------|---------|
| Publish file (auto-Replace if path known) | `publish <absolute-path>` |
| Force new Share | `publish --new <absolute-path>` |
| Replace specific slug | `replace <absolute-path> <slug>` or `publish --replace <slug> <path>` |
| List Shares | `list` |
| Delete Share | `delete <slug>` |
| Re-run setup | `setup <code>` |

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
