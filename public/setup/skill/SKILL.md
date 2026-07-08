---
name: mekari-canvas
description: >-
  Publish and manage Mekari Canvas Shares (HTML or Markdown Artifacts) via the
  Agent API. Use when the user invokes /mekari-canvas, wants to publish a
  handoff doc, list Shares, replace, or delete. Supports setup on first use.
---

# Mekari Canvas

Agent publish for [Mekari Canvas](https://mekari-canvas.vercel.app) — permanent Short links for HTML visualizations and agent-facing Markdown.

## When to use

- User says `/mekari-canvas publish` on an attached `.md` or `.html` file
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
| GET | `/api/shares` | — |
| DELETE | `/api/shares/:slug` | — |

Response includes `slug` — Short link is `{apiBase}/s/{slug}`.

## Publish manifest

Maintain `~/.canvas/publish-manifest.json` mapping **absolute file path → slug** so re-publishing the same file auto-Replaces instead of creating duplicates. The script updates this automatically.

## Rules

- **Artifact kind** is immutable on Replace (`.md` → `md`, `.html` → `html`).
- **Published by** is set at create from the token owner — cannot change on Replace.
- Return the Short link to the user after publish.
- Legacy Shares without **Published by** are not manageable via Agent API.

## Freeform intent

When the user attaches a handoff `.md` and says "publish this to canvas" without a subcommand, run `publish` on the attached file path.
