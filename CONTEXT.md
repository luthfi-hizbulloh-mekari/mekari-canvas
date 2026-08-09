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
Whether a Share holds an **HTML Artifact**, **Markdown Artifact**, or **Playwright Trace Artifact** — stored as `html`, `md`, or `trace`. Set at first publish — detected by file extension on upload (`.html`/`.htm` → `html`, `.md` → `md`, `.zip` → candidate `trace`) or by content sniff on paste for text artifacts; a ZIP becomes a Trace Artifact only after trace-structure validation. Immutable on **Edit** when the Artifact is overwritten — cannot overwrite one kind with another. Shares created before Markdown support may lack kind in storage — treat missing kind as `html`.
_Avoid_: Format, type, mime

**Short link**:
The public URL for a Share (e.g. `https://mekari-canvas.vercel.app/s/x7k9m2p4`). It remains stable for the Share's lifetime. HTML and Markdown Short links serve their Artifact bodies; a Playwright Trace Short link opens the external Trace Viewer, which fetches the trace from the Share's **Raw trace endpoint**. Slug is 8 characters, randomly generated — not user-chosen.
_Avoid_: Link, URL, permalink

**Slug**:
The 8-character random identifier in a Short link. Generated via nanoid — unguessable, URL-safe.
_Avoid_: ID, code, hash

**Title**:
Optional human-facing label for a Share. Not unique across Shares. Identity remains the **Slug**; Title is for Publishers and agents. Visible in publisher surfaces (**My Shares**, publish/**Edit** UI, **Agent API**) — not on the public Short link. Trimmed; blank/whitespace is stored as absent; max length 120 characters; Unicode allowed. In **My Shares**, when set, Title is the row's primary label (clickable to the Short link) in place of `/s/{slug}` and the Short link is not shown again as text; when absent, the primary label falls back to `/s/{slug}`. Copy still copies the full Short link. Browser create leaves the Title field blank (no filename default). May be omitted in storage/API; the **Skill package** instructs agents to supply one on publish. On **Edit**, omitted `title` leaves the existing Title unchanged; empty/whitespace clears it; a non-empty value sets it. Clearable on **Edit**.
_Avoid_: Name, link title, label

**Raw trace endpoint**:
The non-canonical, public `/s/{slug}/trace` URL for a Playwright Trace Artifact that returns the stored ZIP to Trace Viewer while the underlying Blob remains private. It is CORS-enabled for the external viewer, supports the viewer's remote-trace fetch, and is not the Share link people are expected to copy; anyone holding the Share link can still fetch or download the raw bytes.
_Avoid_: Download link, ZIP link, asset URL

**Trace expiration**:
An optional deadline on a Playwright Trace Share. When present, it is shown to Publishers and returned by the Agent API. Requests enforce the deadline immediately, and a daily sweeper permanently deletes the Share and its ZIP after the deadline, so the expired Short link cannot be replaced or reactivated. Viewing or downloading a trace never extends its deadline.
_Avoid_: TTL, timeout, archive policy

**Trace retention policy**:
The size-based rule applied to the final validated compressed Playwright Trace Artifact size at publish commit. Traces smaller than exactly 1,000,000 bytes have no automatic expiration; traces at or above 1,000,000 bytes expire 168 hours after a successful publish commit. On **Edit** that overwrites the Artifact, same-class traces preserve any existing Trace expiration verbatim, large → small clears it, and small → large sets a new seven-day deadline from the Artifact overwrite commit.
_Avoid_: Approximate 1 MB cutoff, ZIP lifetime

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
The Publisher's Google email, captured at Share create and stored in KV **Share** metadata. Immutable on **Edit**. Shown in **My Shares** only — not exposed on the public Short link.
_Avoid_: Author, owner, creator

**Blob store**:
Vercel Blob holds Artifact payloads (HTML, Markdown, and Playwright trace ZIPs). A separate lightweight index (Vercel KV) maps slug → blob path, **Artifact kind**, **Title**, and metadata.
_Avoid_: Database, S3, filesystem

**Edit**:
Mutating an existing Share in place — **Title** and/or Artifact — without changing the Short link. In the browser, **Edit** is entered from **My Shares** (pencil): arms the homepage publish panel with Title prefilled and CTA **save**; there is no free-typed slug/Short-link target field. Dropping/pasting a new Artifact is optional — Title-only save is allowed. Title-only Edit leaves the Artifact untouched. Over the **Agent API**, create and Edit share `POST /api/publish`: Edit targets via `editSlug` only (no `replaceSlug` alias); Artifact payload optional when editing; `title` follows omit/keep, empty/clear, value/set. When the Artifact is overwritten, **Artifact kind** stays immutable; for Playwright Trace Artifacts, same-class overwrite preserves Trace expiration, large → small clears it, and small → large sets a new seven-day deadline from the overwrite commit. Publish-manifest auto-Edit preserves Title when `title` is omitted.
_Avoid_: Replace, update, revise

**Delete**:
Removing a Share entirely — its Short link returns 404. Same authorization as **Edit**.
_Avoid_: Remove, unpublish, archive

**My Shares**:
The list of Shares published by the signed-in **Publisher**, fetched from the server (**Agent API** list). Each row's primary label is the Share's **Title** when set, otherwise `/s/{slug}`; that label links to the Short link. The Short link is not shown again as separate text when Title is present. Meta shows **Artifact kind** (`html`, `md`, or `trace`); Playwright Trace rows also show their size and show an expiration date only when one exists. Actions: copy Short link, **Edit** (pencil) arms the homepage publish panel for that Share, Delete. Only visible after **Publisher sign-in**.
_Avoid_: History, dashboard, library

**Browser edit token**:
Legacy per-Share secret stored in the publisher's browser (`localStorage`) at create time. No longer required for **Edit** or **Delete** when **Published by** matches the signed-in **Publisher** — kept only for grandfathering legacy Shares without **Published by**.
_Avoid_: Edit token, cookie, session

**Publisher API token**:
Long-lived secret tied to one **Publisher** (`@mekari.com` email). Sent as `Authorization: Bearer` for **Agent publish** — create, Edit, Delete, and list Shares without browser paste/upload. One token is stored per global machine setup and shared by its supported **Agent surfaces**; a valid token is reused, while missing or rejected credentials are replaced. Revocable from the homepage.
_Avoid_: API key, PAT, access token

**Setup code**:
One-time, short-lived code minted after a **Publisher** opens **Add skill** on the homepage and chooses a launch **Agent surface**. The selected surface exchanges it for a **Publisher API token** and Canvas setup metadata during local setup — the token never appears in chat or copy-paste UI.
_Avoid_: Auth code, pairing code, OAuth code

**Setup bundle**:
Canvas-specific setup inputs for connecting an installed **Skill package** to **Agent publish** — the one-time **Setup code**, API base URL, and exchange/manifest metadata. It does not contain the **Publisher API token** and is not the Skill package itself.
_Avoid_: Skill pack, installer, plugin

**Skill package**:
The public, versioned set of `SKILL.md` and supporting files published in the Mekari Canvas GitHub repository. It is the canonical source installed or refreshed globally through the standard **Skills CLI** for the current supported **Agent surfaces**: Cursor, Claude Code, and Codex CLI.
_Avoid_: Setup bundle, integration, harness files

**Setup manifest**:
Public thin JSON hosted on the Canvas site (`/setup/manifest.json`) listing only the API base URL and exchange endpoint. Companion MD (`/setup/guide.md`) gives human-readable steps. The **Add skill** page renders a copy-paste prompt block (**Skills CLI** package source + **Setup code**) when the selected **Agent surface** has no supported deep link or the launch fails.
_Avoid_: Config file, README, integration doc

**Skill refresh**:
Re-running the setup prompt for an existing installation — refreshes the current **Skill package** while preserving a valid shared **Publisher API token**. A missing or rejected token may be replaced using the new **Setup code**.
_Avoid_: Reconnect, reauthorize, duplicate installation

**Agent publish**:
Creating or mutating any supported Share Artifact via the **Agent API** using a **Publisher API token**, instead of the signed-in homepage paste/upload flow. Playwright Trace Artifacts are uploaded as binary payloads through this path.
_Avoid_: MCP publish, CLI upload, programmatic upload

**Agent API**:
Harness-agnostic HTTP endpoints for Share create, Edit, Delete, and list — authenticated by **Publisher API token**. Same storage and Short links as browser publish; HTML/Markdown use text payloads and Playwright Trace Artifacts use binary file uploads. Consumers are the **`/mekari-canvas`** Skill package on Cursor, Claude Code, and Codex CLI.
_Avoid_: MCP server, SDK, integration

**Add skill**:
Homepage action for a signed-in **Publisher** — opens a chooser, then mints one **Setup code** for the selected launch **Agent surface**. The resulting prompt installs the **Skill package** globally for Cursor, Claude Code, and Codex CLI and enables **Agent publish**.
_Avoid_: Connect, install, link account

**Agent surface**:
A local coding-agent client that can receive the Add skill setup prompt and use the globally installed **Skill package**. The supported surfaces are Cursor, Claude Code, and Codex CLI; choosing one selects only where the prompt opens, not the installation scope.
_Avoid_: Harness, AI app, integration

**Mekari Canvas skill**:
The installed **Skill package** entry point for **Agent publish** — invoked as **`/mekari-canvas`**. Supports explicit subcommands (`publish`, `list`, `delete`, `edit`, `setup`) or freeform intent when context is clear (e.g. attached handoff file or Playwright trace ZIP). Instructs agents to supply a **Title** on publish (`title` / `--title`) — a short descriptive phrase (about 3–8 words) from the Artifact's purpose, under 120 characters. Agent `list` columns: `slug, title, kind, updatedAt, …` (empty Title when absent). Installed globally through the **Skills CLI** so it works from any repo.
_Avoid_: Canvas skill, publish skill, MCP tool

**Skills CLI**:
The standard `npx skills` package manager for discovering, installing, and updating **Skill packages** across supported **Agent surfaces**. Global installation is user-level and available across repositories.
_Avoid_: skills.sh registry, harness installer, Canvas installer

## Relationships

- One **Share** has exactly one **Artifact** — HTML, Markdown, or Playwright trace
- One **Share** has at most one **Title**
- One **Short link** maps to exactly one **Share**
- **Viewing** a Share requires only the Short link (unguessable slug) — no login
- **Publishing** a Share requires **Publisher sign-in** before any paste or upload on the homepage; create sets **Published by** from the session email
- Both homepage publishing and **Agent publish** can create or Edit HTML, Markdown, and Playwright Trace Artifacts and set **Title**
- Playwright Trace Artifact uploads use a binary file contract; an upload is not a base64- or JSON-encoded text Artifact
- **Edit** keeps the same Short link; absent Edit target, publish creates a new Share
- **Edit** may change **Title** alone, Artifact alone, or both; Title-only Edit does not touch the Artifact
- **Edit** requires **Publisher sign-in** or **Publisher API token**; session or token identity must match **Published by**; **Published by** unchanged on Edit
- An active Playwright Trace **Share** keeps its original **Trace expiration** on same-class Artifact overwrite; large → small clears it, while small → large sets a new seven-day deadline; after expiration and sweeping, its Short link and raw endpoint return 404 and a new Share is required
- A candidate ZIP must pass **Trace structure validation** before it becomes a Playwright Trace Artifact
- **Trace expiration** is visible in **My Shares** only when present and is included as an ISO date or explicit `null` in trace publish/list responses
- **Trace expiration** is enforced at request time and finalized by a daily cleanup sweep
- **Delete** requires the same authorization as **Edit**
- HTML and Markdown **Shares** are served raw at their Short links — HTML Artifacts as `text/html`, Markdown Artifacts as `text/markdown`; no iframe wrapper
- A Playwright Trace **Share** redirects from its Short link to Playwright Trace Viewer; Trace Viewer fetches the ZIP from the Share's **Raw trace endpoint**
- The **Raw trace endpoint** is public and CORS-enabled for Playwright Trace Viewer, while its underlying Blob storage is private
- The trace redirect is a convenience boundary, not download prevention; link-holders can fetch the **Raw trace endpoint**
- **Agent publish** Edit and Delete require **Publisher API token** + matching **Published by**
- **Setup code** exchanges once for the global setup's **Publisher API token** through the selected launch **Agent surface**; revocable from the homepage independently of **Publisher sign-in**
- **Add skill** requires **Publisher sign-in**; the resulting token enables **Agent publish** from all supported **Agent surfaces** after the global setup completes
- **Setup manifest** is public; **Setup code** is single-use and minted per click — token only via exchange, never embedded in the manifest
- **Skill refresh** replaces the managed skill files but leaves the existing **Publisher API token** and unrelated local files untouched
- A **Skill refresh** checks the shared token before exchanging the new **Setup code**; valid credentials are reused, while missing or rejected credentials are replaced
- The **Skills CLI** owns **Skill package** installation and refresh; the Mekari Canvas setup command owns only token exchange/reuse and `~/.canvas/config.json`
- The existing public `mekari-canvas` GitHub repository is the canonical source for the **Skill package**; the **Skills CLI** distributes it globally to Cursor, Claude Code, and Codex CLI, while the selected surface only launches the prompt
- **Add skill** uses a native deep link when the selected **Agent surface** supports one; otherwise it keeps the setup popup available with the copyable raw prompt fallback

## Example dialogue

> **Dev:** "User pastes HTML — do we create a **Share** immediately or save a draft?"
> **Domain expert:** "Immediately. No draft state. Paste or drag `.html` file → upload → **Short link** returned."
>
> **Dev:** "Typo after posting to Slack — new link?"
> **Domain expert:** "No. Same **Publisher** — **Edit** the Share, re-upload Artifact. Or **`/mekari-canvas publish`** again on the same file."
>
> **Dev:** "Agent needs PR summary as markdown — render it?"
> **Domain expert:** "No. Store raw `.md`, serve `text/markdown`. Ugly in browser is fine — agents fetch the body, not humans."
>
> **Dev:** "Handoff done — agent publish without opening the site?"
> **Domain expert:** "Yes. **Add skill** once → **Publisher API token** stored locally → **`/mekari-canvas publish`** on the handoff file with a **Title** → **Short link** returned. **Edit** same slug when the doc or Title changes."

## Flagged ambiguities

- "org-only" means link discipline + unguessable slugs, not network isolation — resolved for v1.
- Edit authorization: **Publisher sign-in** or **Publisher API token**; identity must match **Published by** — resolved with **Agent publish**.
- **Organization code** (shared secret via `x-upload-gate`) superseded by **Publisher sign-in** — remove after Google OAuth ships.
- Legacy Shares (no **Published by** in KV): **Edit** and **Delete** still require valid **Browser edit token** — grandfather only; new publishes always set **Published by**.
- **Browser edit token** deprecated for new Shares — may still be returned on browser create short term but server ignores when **Published by** matches.
