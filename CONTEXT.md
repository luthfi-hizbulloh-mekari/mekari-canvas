# Canvas

Internal Mekari tool for engineers to upload self-contained HTML visualizations, agent-facing Markdown, and Playwright traces, sharing them via public short links — replacing ephemeral third-party HTML hosts and ad-hoc paste targets for rich content like PR summaries and test diagnostics. Deployed at `mekari-canvas.vercel.app`.

## Language

**Share**:
A single published Artifact (HTML, Markdown, or Playwright trace) accessible via a unique Short link.
_Avoid_: Page, post, doc, upload

**Artifact**:
A stored payload for a Share. Three kinds — **HTML Artifact**, **Markdown Artifact**, and **Playwright Trace Artifact** (see below). HTML and Markdown Artifacts are limited to 500 KB; Playwright Trace Artifacts are limited to 50 MB. No separate uploaded asset files.
_Avoid_: File, document, content

**HTML Artifact**:
Self-contained `.html` body for human viewing. Images and styles should be inline; external CDN `<script>` and `<link>` tags are allowed. Must contain `<html` or `<!DOCTYPE` — otherwise publish is rejected. Served as raw HTML at the Short link.
_Avoid_: HTML file, visualization file

**Markdown Artifact**:
Raw `.md` body for **agent** consumption — not styled for human reading. Stored and served as-is (`text/markdown`). No `<html` requirement. Reject if empty or whitespace-only after trim. Typical use: agent-readable PR summaries, structured notes, copy-paste into other tools.
_Avoid_: MD file, text doc

**Playwright Trace Artifact**:
A Playwright-generated trace ZIP intended for interactive inspection in Playwright Trace Viewer. It is a trace payload, not a general-purpose ZIP upload, is accepted only when Canvas can recognize its supported trace structure, is limited to 50 MB, and is publicly viewable by anyone holding its Short link.
_Avoid_: ZIP file, archive, attachment

**Artifact kind**:
Whether a Share holds an **HTML Artifact**, **Markdown Artifact**, or **Playwright Trace Artifact** — stored as `html`, `md`, or `trace`. Set at first publish — detected by file extension on upload (`.html`/`.htm` → `html`, `.md` → `md`, `.zip` → candidate `trace`) or by content sniff on paste for text artifacts; a ZIP becomes a Trace Artifact only after trace-structure validation. Immutable on **Replace** — cannot overwrite one kind with another. Shares created before Markdown support may lack kind in storage — treat missing kind as `html`.
_Avoid_: Format, type, mime

**Short link**:
The public URL for a Share (e.g. `https://mekari-canvas.vercel.app/s/x7k9m2p4`). It remains stable for the Share's lifetime. HTML and Markdown Short links serve their Artifact bodies; a Playwright Trace Short link opens the external Trace Viewer, which fetches the trace from the Share's **Raw trace endpoint**. Slug is 8 characters, randomly generated — not user-chosen.
_Avoid_: Link, URL, permalink

**Slug**:
The 8-character random identifier in a Short link. Generated via nanoid — unguessable, URL-safe.
_Avoid_: ID, code, hash

**Raw trace endpoint**:
The non-canonical, public `/s/{slug}/trace` URL for a Playwright Trace Artifact that returns the stored ZIP to Trace Viewer while the underlying Blob remains private. It is CORS-enabled for the external viewer, supports the viewer's remote-trace fetch, and is not the Share link people are expected to copy; anyone holding the Share link can still fetch or download the raw bytes.
_Avoid_: Download link, ZIP link, asset URL

**Trace expiration**:
The 30-day retention window for a Playwright Trace Share, measured from its first publish. Replacing an active trace does not change the expiration date; the expiration date is shown to Publishers and returned by the Agent API. Requests enforce the deadline immediately, and a daily sweeper permanently deletes the Share and its ZIP after the window, so the expired Short link cannot be replaced or reactivated.
_Avoid_: TTL, timeout, archive policy

**Trace structure validation**:
A best-effort server-side check that a candidate ZIP has a supported Playwright trace structure without extracting or executing its contents or pinning it to a Playwright release. Unrecognized ZIPs are rejected; support may expand as Playwright trace formats evolve.
_Avoid_: ZIP validation, malware scan, unpacking

**Publisher sign-in**:
Google OAuth restricted to `@mekari.com`. Required to publish or delete a Share. Server-verified session — replaces the former shared **Organization code**. Homepage shows signed-in email and Sign out.
_Avoid_: Auth, login, SSO, upload gate

**Publisher**:
A Mekari employee who has completed **Publisher sign-in** with a `@mekari.com` Google account.
_Avoid_: User, member, employee (too broad)

**Published by**:
The Publisher's Google email, captured at Share create and stored in KV **Share** metadata. Immutable on **Replace**. Shown in **My Shares** only — not exposed on the public Short link.
_Avoid_: Author, owner, creator

**Blob store**:
Vercel Blob holds Artifact payloads (HTML, Markdown, and Playwright trace ZIPs). A separate lightweight index (Vercel KV) maps slug → blob path, **Artifact kind**, and metadata.
_Avoid_: Database, S3, filesystem

**Replace**:
Overwriting an existing Share's Artifact in place — the Short link stays the same. Optional field on publish: paste an existing Short link to target. Replacing an active Playwright Trace Artifact does not extend its existing expiration date.
_Avoid_: Edit, update, revise

**Delete**:
Removing a Share entirely — its Short link returns 404. Same authorization as **Replace**.
_Avoid_: Remove, unpublish, archive

**My Shares**:
The list of Shares published by the signed-in **Publisher**, fetched from the server (**Agent API** list). Each row shows slug, **Artifact kind** (`html`, `md`, or `trace`), and **Published by**; Playwright Trace rows also show their expiration date. Clicking one prefills the Replace field for quick overwrite. Only visible after **Publisher sign-in**.
_Avoid_: History, dashboard, library

**Browser edit token**:
Legacy per-Share secret stored in the publisher's browser (`localStorage`) at create time. No longer required for **Replace** or **Delete** when **Published by** matches the signed-in **Publisher** — kept only for grandfathering legacy Shares without **Published by**.
_Avoid_: Edit token, cookie, session

**Publisher API token**:
Long-lived secret tied to one **Publisher** (`@mekari.com` email). Sent as `Authorization: Bearer` for **Agent publish** — create, Replace, Delete, and list Shares without browser paste/upload. One token minted per **Add skill** setup (per machine/harness); revocable individually on the homepage.
_Avoid_: API key, PAT, access token

**Setup code**:
One-time, short-lived code minted when a **Publisher** clicks **Add skill** on the homepage. A harness agent exchanges it for a **Publisher API token** and the **Setup bundle** during local setup — the token never appears in chat or copy-paste UI.
_Avoid_: Auth code, pairing code, OAuth code

**Setup bundle**:
Canonical skill files and config the agent writes locally at setup — returned from the setup exchange and/or fetched via the **Setup manifest**. Includes `SKILL.md`, optional scripts, and API base URL. Same bundle for every harness; Cursor is the first consumer.
_Avoid_: Skill pack, installer, plugin

**Setup manifest**:
Public thin JSON hosted on the Canvas site (`/setup/manifest.json`) listing API base URL, exchange endpoint, and URLs for each **Setup bundle** file (e.g. `SKILL.md`, scripts). Companion MD (`/setup/guide.md`) gives human-readable steps. The **Add skill** page renders a copy-paste prompt block (manifest URL + **Setup code**) when the deep link cannot open the harness.
_Avoid_: Config file, README, integration doc

**Agent publish**:
Creating or mutating any supported Share Artifact via the **Agent API** using a **Publisher API token**, instead of the signed-in homepage paste/upload flow. Playwright Trace Artifacts are uploaded as binary payloads through this path.
_Avoid_: MCP publish, CLI upload, programmatic upload

**Agent API**:
Harness-agnostic HTTP endpoints for Share create, Replace, Delete, and list — authenticated by **Publisher API token**. Same storage and Short links as browser publish; HTML/Markdown use text payloads and Playwright Trace Artifacts use binary file uploads. First consumer is the **`/mekari-canvas`** Cursor skill.
_Avoid_: MCP server, SDK, integration

**Add skill**:
Homepage action for a signed-in **Publisher** — mints a **Setup code** and opens the user's harness (Cursor first) so an agent can complete one-time local setup and enable **Agent publish**.
_Avoid_: Connect, install, link account

**Mekari Canvas skill**:
The harness entry point for **Agent publish** — invoked as **`/mekari-canvas`**. Supports explicit subcommands (`publish`, `list`, `delete`, `replace`, `setup`) or freeform intent when context is clear (e.g. attached handoff file or Playwright trace ZIP). Installed user-wide so it works from any repo.
_Avoid_: Canvas skill, publish skill, MCP tool

## Relationships

- One **Share** has exactly one **Artifact** — HTML, Markdown, or Playwright trace
- One **Short link** maps to exactly one **Share**
- **Viewing** a Share requires only the Short link (unguessable slug) — no login
- **Publishing** a Share requires **Publisher sign-in** before any paste or upload on the homepage; create sets **Published by** from the session email
- Both homepage publishing and **Agent publish** can create or Replace HTML, Markdown, and Playwright Trace Artifacts
- Playwright Trace Artifact uploads use a binary file contract; an upload is not a base64- or JSON-encoded text Artifact
- **Replace** keeps the same Short link; absent Replace target, publish creates a new Share
- **Replace** requires **Publisher sign-in** or **Publisher API token**; session or token identity must match **Published by**; **Published by** unchanged on Replace
- An active Playwright Trace **Share** keeps its original **Trace expiration** when replaced; after expiration and sweeping, its Short link and raw endpoint return 404 and a new Share is required
- A candidate ZIP must pass **Trace structure validation** before it becomes a Playwright Trace Artifact
- **Trace expiration** is visible in **My Shares** and included in publish/list responses
- **Trace expiration** is enforced at request time and finalized by a daily cleanup sweep
- **Delete** requires the same authorization as **Replace**
- HTML and Markdown **Shares** are served raw at their Short links — HTML Artifacts as `text/html`, Markdown Artifacts as `text/markdown`; no iframe wrapper
- A Playwright Trace **Share** redirects from its Short link to Playwright Trace Viewer; Trace Viewer fetches the ZIP from the Share's **Raw trace endpoint**
- The **Raw trace endpoint** is public and CORS-enabled for Playwright Trace Viewer, while its underlying Blob storage is private
- The trace redirect is a convenience boundary, not download prevention; link-holders can fetch the **Raw trace endpoint**
- **Agent publish** Replace and Delete require **Publisher API token** + matching **Published by**
- **Setup code** exchanges once for one **Publisher API token** per harness setup; revocable from the homepage independently of **Publisher sign-in**
- Each **Add skill** setup mints a distinct **Publisher API token** for that machine/harness — revoking one does not invalidate others
- **Add skill** requires **Publisher sign-in**; the resulting token enables **Agent publish** from that harness only after local setup completes
- **Setup manifest** is public; **Setup code** is single-use and minted per click — token only via exchange, never embedded in the manifest

## Example dialogue

> **Dev:** "User pastes HTML — do we create a **Share** immediately or save a draft?"
> **Domain expert:** "Immediately. No draft state. Paste or drag `.html` file → upload → **Short link** returned."
>
> **Dev:** "Typo after posting to Slack — new link?"
> **Domain expert:** "No. Same **Publisher** — paste **Short link** in Replace field, re-upload. Or **`/mekari-canvas publish`** again on the same file."
>
> **Dev:** "Agent needs PR summary as markdown — render it?"
> **Domain expert:** "No. Store raw `.md`, serve `text/markdown`. Ugly in browser is fine — agents fetch the body, not humans."
>
> **Dev:** "Handoff done — agent publish without opening the site?"
> **Domain expert:** "Yes. **Add skill** once → **Publisher API token** stored locally → **`/mekari-canvas publish`** on the handoff file → **Short link** returned. **Replace** same slug when the doc changes."

## Flagged ambiguities

- "org-only" means link discipline + unguessable slugs, not network isolation — resolved for v1.
- Replace authorization: **Publisher sign-in** or **Publisher API token**; identity must match **Published by** — resolved with **Agent publish**.
- **Organization code** (shared secret via `x-upload-gate`) superseded by **Publisher sign-in** — remove after Google OAuth ships.
- Legacy Shares (no **Published by** in KV): **Replace** and **Delete** still require valid **Browser edit token** — grandfather only; new publishes always set **Published by**.
- **Browser edit token** deprecated for new Shares — may still be returned on browser create short term but server ignores when **Published by** matches.
