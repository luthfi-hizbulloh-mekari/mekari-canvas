# Agent publish via API token and hosted skill setup

Canvas exposes a harness-agnostic **Agent API** (create, Replace, Delete, list Shares) authenticated by **Publisher API token** (`Authorization: Bearer`). The first consumer is the **`/mekari-canvas`** Cursor skill — not an MCP server in v1.

**Why not MCP first?** The primary workflow is one-shot publish of handoff Markdown from an AI session. A skill wrapping HTTP endpoints is enough for Cursor; MCP adds discovery and multi-tool surface area without solving the harder problem (auth + setup). The same API can gain an MCP wrapper later without changing storage or Short links.

**Setup flow:** Signed-in **Publisher** clicks **Add skill** on the homepage → mints a one-time **Setup code** → deep link opens the harness (Cursor first) or copy-paste fallback references the public **Setup manifest** (`/setup/manifest.json`) and companion guide MD. The agent fetches the thin manifest (API base, exchange URL, bundle file URLs), downloads hosted skill files (`SKILL.md`, scripts), exchanges the code for a long-lived **Publisher API token**, and writes local config. One token per setup (per machine/harness); revocable individually on the site.

**Considered options:** (1) MCP server as the only integration — rejected for v1 scope and setup complexity; (2) OAuth device code flow — rejected; worse UX than one-click **Add skill**; (3) session cookie copy from browser — rejected; fragile across harnesses; (4) fat JSON manifest embedding full skill content — rejected; thin JSON + hosted files is easier to edit and copy-paste.

**Auth for mutations:** Replace and Delete require identity matching **Published by** — via **Publisher sign-in** (browser) or **Publisher API token** (agent). **Browser edit token** is deprecated for new Shares; legacy Shares without **Published by** still require a valid edit token (grandfather only).

**My Shares:** Homepage list moves from `localStorage` to the server list API keyed by **Published by** — same source agents use.

**Consequences:** KV gains publisher-token storage and a publisher→shares index for list. Setup bundle files live in-repo under `public/setup/` (or equivalent). Re-click **Add skill** to refresh skill files after API changes. See `CONTEXT.md` for glossary.
