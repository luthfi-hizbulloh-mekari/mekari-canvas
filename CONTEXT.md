# Canvas

Internal Mekari tool for engineers to upload self-contained HTML visualizations and share them via permanent short links — replacing ephemeral third-party HTML hosts and plain-text Confluence/markdown for rich content like PR summaries. Deployed at `mekari-canvas.vercel.app`.

## Language

**Share**:
A single published HTML document accessible via a unique short URL.
_Avoid_: Page, post, doc, upload

**Artifact**:
The `.html` file body stored for a Share. Images and styles should be inline; external CDN `<script>` and `<link>` tags are allowed. No separate uploaded asset files. Maximum size: 500 KB. Must contain `<html` or `<!DOCTYPE` — otherwise publish is rejected.
_Avoid_: File, document, content

**Short link**:
The permanent public URL that serves an Artifact (e.g. `https://mekari-canvas.vercel.app/s/x7k9m2p4`). Slug is 8 characters, randomly generated — not user-chosen.
_Avoid_: Link, URL, permalink

**Slug**:
The 8-character random identifier in a Short link. Generated via nanoid — unguessable, URL-safe.
_Avoid_: ID, code, hash

**Upload gate**:
A lightweight shared secret (team password) required to publish a Share. Not full SSO — blocks drive-by abuse on a public deployment. Entered once per browser; session persisted in `localStorage`.
_Avoid_: Auth, login, SSO

**Blob store**:
Vercel Blob holds Artifact HTML bodies. A separate lightweight index (Vercel KV) maps slug → blob path and metadata.
_Avoid_: Database, S3, filesystem

**Replace**:
Overwriting an existing Share's Artifact in place — the Short link stays the same. Optional field on publish: paste an existing Short link to target.
_Avoid_: Edit, update, revise

**Delete**:
Removing a Share entirely — its Short link returns 404. Same authorization as Replace: Upload gate + matching **Browser edit token**.
_Avoid_: Remove, unpublish, archive

**My Shares**:
The list of Shares published from the current browser, derived from `localStorage`. Clicking one prefills the Replace field for quick overwrite.
_Avoid_: History, dashboard, library

**Browser edit token**:
A per-Share secret stored only in the publisher's browser (`localStorage`) at create time. Required alongside Upload gate to Replace that Share. Never shown for manual copy — lost browser storage means a new Share must be published.
_Avoid_: Edit token, cookie, session

## Relationships

- One **Share** has exactly one **Artifact**
- One **Short link** maps to exactly one **Share**
- **Viewing** a Share requires only the Short link (unguessable slug) — no login
- **Publishing** a Share requires passing the **Upload gate**
- **Replace** keeps the same Short link; absent Replace target, publish creates a new Share
- **Replace** requires Upload gate + matching **Browser edit token** for that Share (auto-sent from `localStorage`)
- **Delete** requires the same authorization as **Replace**
- Each **Share** is served as raw HTML — no iframe wrapper

## Example dialogue

> **Dev:** "User pastes HTML — do we create a **Share** immediately or save a draft?"
> **Domain expert:** "Immediately. No draft state. Paste or drag `.html` file → upload → **Short link** returned."
>
> **Dev:** "Typo after posting to Slack — new link?"
> **Domain expert:** "No. Same browser — **Browser edit token** in localStorage auto-attaches. Paste **Short link** in Replace field, re-upload."

## Flagged ambiguities

- "org-only" means link discipline + unguessable slugs, not network isolation or SSO — resolved for v1.
- Replace authorization: Upload gate + per-Share **Browser edit token** in `localStorage` only — no cross-browser fallback for v1.
