# Canvas

Internal Mekari tool for engineers to upload self-contained HTML visualizations and agent-facing Markdown, sharing both via permanent short links — replacing ephemeral third-party HTML hosts and ad-hoc paste targets for rich content like PR summaries. Deployed at `mekari-canvas.vercel.app`.

## Language

**Share**:
A single published Artifact (HTML or Markdown) accessible via a unique short URL.
_Avoid_: Page, post, doc, upload

**Artifact**:
The file body stored for a Share. Two kinds — **HTML Artifact** and **Markdown Artifact** (see below). Maximum size: 500 KB each. No separate uploaded asset files.
_Avoid_: File, document, content

**HTML Artifact**:
Self-contained `.html` body for human viewing. Images and styles should be inline; external CDN `<script>` and `<link>` tags are allowed. Must contain `<html` or `<!DOCTYPE` — otherwise publish is rejected. Served as raw HTML at the Short link.
_Avoid_: HTML file, visualization file

**Markdown Artifact**:
Raw `.md` body for **agent** consumption — not styled for human reading. Stored and served as-is (`text/markdown`). No `<html` requirement. Reject if empty or whitespace-only after trim. Typical use: agent-readable PR summaries, structured notes, copy-paste into other tools.
_Avoid_: MD file, text doc

**Artifact kind**:
Whether a Share holds an **HTML Artifact** or **Markdown Artifact** — stored as `html` or `md`. Set at first publish — detected by file extension on upload (`.html`/`.htm` → `html`, `.md` → `md`) or by content sniff on paste (contains `<html` or `<!DOCTYPE` in first 2 KB → `html`, otherwise → `md`). Immutable on **Replace** — cannot overwrite an HTML Share with Markdown or vice versa. Shares created before Markdown support may lack kind in storage — treat missing kind as `html`.
_Avoid_: Format, type, mime

**Short link**:
The permanent public URL that serves an Artifact (e.g. `https://mekari-canvas.vercel.app/s/x7k9m2p4`). Same `/s/{slug}` path for both HTML and Markdown Shares — response `Content-Type` differs. Slug is 8 characters, randomly generated — not user-chosen.
_Avoid_: Link, URL, permalink

**Slug**:
The 8-character random identifier in a Short link. Generated via nanoid — unguessable, URL-safe.
_Avoid_: ID, code, hash

**Organization code**:
A lightweight shared secret (team password) required to publish a Share. Not full SSO — blocks drive-by abuse on a public deployment. Entered once per browser; session persisted in `localStorage`.
_Avoid_: Auth, login, SSO, upload gate

**Blob store**:
Vercel Blob holds Artifact bodies (HTML and Markdown). A separate lightweight index (Vercel KV) maps slug → blob path, **Artifact kind**, and metadata.
_Avoid_: Database, S3, filesystem

**Replace**:
Overwriting an existing Share's Artifact in place — the Short link stays the same. Optional field on publish: paste an existing Short link to target.
_Avoid_: Edit, update, revise

**Delete**:
Removing a Share entirely — its Short link returns 404. Same authorization as Replace: **Organization code** + matching **Browser edit token**.
_Avoid_: Remove, unpublish, archive

**My Shares**:
The list of Shares published from the current browser, derived from `localStorage`. Each row shows slug and **Artifact kind** (`html` or `md`). Clicking one prefills the Replace field for quick overwrite.
_Avoid_: History, dashboard, library

**Browser edit token**:
A per-Share secret stored only in the publisher's browser (`localStorage`) at create time. Required alongside **Organization code** to Replace that Share. Never shown for manual copy — lost browser storage means a new Share must be published.
_Avoid_: Edit token, cookie, session

## Relationships

- One **Share** has exactly one **Artifact** — either HTML or Markdown, not both
- One **Short link** maps to exactly one **Share**
- **Viewing** a Share requires only the Short link (unguessable slug) — no login
- **Publishing** a Share requires the **Organization code**
- **Replace** keeps the same Short link; absent Replace target, publish creates a new Share
- **Replace** requires **Organization code** + matching **Browser edit token** for that Share (auto-sent from `localStorage`)
- **Delete** requires the same authorization as **Replace**
- Each **Share** is served raw at its Short link — HTML Artifacts as `text/html`, Markdown Artifacts as `text/markdown`; no iframe wrapper

## Example dialogue

> **Dev:** "User pastes HTML — do we create a **Share** immediately or save a draft?"
> **Domain expert:** "Immediately. No draft state. Paste or drag `.html` file → upload → **Short link** returned."
>
> **Dev:** "Typo after posting to Slack — new link?"
> **Domain expert:** "No. Same browser — **Browser edit token** in localStorage auto-attaches. Paste **Short link** in Replace field, re-upload."
>
> **Dev:** "Agent needs PR summary as markdown — render it?"
> **Domain expert:** "No. Store raw `.md`, serve `text/markdown`. Ugly in browser is fine — agents fetch the body, not humans."

## Flagged ambiguities

- "org-only" means link discipline + unguessable slugs, not network isolation or SSO — resolved for v1.
- Replace authorization: **Organization code** + per-Share **Browser edit token** in `localStorage` only — no cross-browser fallback for v1.
