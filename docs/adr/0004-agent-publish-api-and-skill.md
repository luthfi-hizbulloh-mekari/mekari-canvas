# Agent publish via API token and hosted skill setup

Canvas exposes a harness-agnostic **Agent API** (create, Replace, Delete, list Shares) authenticated by **Publisher API token** (`Authorization: Bearer`). Consumers use the **`/mekari-canvas`** Skill package on Cursor, Claude Code, and Codex CLI — not an MCP server in v1.

**Why not MCP first?** The primary workflow is one-shot publish of handoff Markdown from an AI session. A skill wrapping HTTP endpoints is enough for Cursor; MCP adds discovery and multi-tool surface area without solving the harder problem (auth + setup). The same API can gain an MCP wrapper later without changing storage or Short links.

**Setup flow:** Signed-in **Publisher** clicks **Add skill** on the homepage → chooses Cursor, Claude Code, or Codex CLI → Canvas mints a one-time **Setup code** → the selected surface receives a prompt by a supported native deep link or clipboard. The prompt runs the standard Skills CLI global install/refresh for all three surfaces, then the bundled setup helper validates or exchanges one shared **Publisher API token** and writes `~/.canvas/config.json`. The Skills CLI owns managed Skill files; token setup does not download them. See ADR 0013 for the distribution decision.

**Considered options:** (1) MCP server as the only integration — rejected for v1 scope and setup complexity; (2) OAuth device code flow — rejected; worse UX than one-click **Add skill**; (3) session cookie copy from browser — rejected; fragile across harnesses; (4) fat JSON manifest embedding full skill content — rejected; the thin manifest contains only token-exchange metadata, while the public repository is canonical for Skill files.

**Auth for mutations:** Replace and Delete require identity matching **Published by** — via **Publisher sign-in** (browser) or **Publisher API token** (agent). **Browser edit token** is deprecated for new Shares; legacy Shares without **Published by** still require a valid edit token (grandfather only).

**My Shares:** Homepage list moves from `localStorage` to the server list API keyed by **Published by** — same source agents use.

**Consequences:** KV gains publisher-token storage and a publisher→shares index for list. The same-origin setup manifest is served dynamically so preview and production codes exchange against the deployment that minted them. The guide and installable Skill package live under `public/setup/`; the public repository is the canonical distribution source. Re-run **Add skill** to refresh managed Skill files across all three surfaces without replacing a valid shared token. See `CONTEXT.md` and ADR 0013.
