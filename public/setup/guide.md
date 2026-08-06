# Mekari Canvas — global Agent setup

Install or refresh one Skill package globally for Cursor, Claude Code, and Codex CLI, then connect all three to **Agent publish** with one shared Publisher API token.

## What you need

1. **Skills CLI** through `npx`
2. **Setup code** — one-time code created after choosing a destination from the Canvas homepage **Add skill** action (expires in ~10 minutes)

The selected destination only controls where the prompt opens. Installation scope is always global for exactly Cursor, Claude Code, and Codex CLI.

## Setup prompt

```text
Install or refresh the Mekari Canvas skill globally for Cursor, Claude Code and Codex CLI.

1. Install/refresh the skill package (Skills CLI owns this):
   npx skills add https://github.com/luthfi-hizbulloh-mekari/mekari-canvas --skill mekari-canvas --global --agent cursor --agent claude-code --agent codex --yes

2. Exchange or reuse the shared Publisher API token in ~/.canvas/config.json:
   cd <installed-mekari-canvas-skill-directory>
   bash scripts/mekari-canvas.sh setup '{SETUP_CODE}'
```

Replace `{SETUP_CODE}` with the value from the homepage. The Skills CLI prints the installed Skill directory. Run the helper from that directory; Skills CLI does not add a `mekari-canvas` executable to `PATH`.

Token setup does not install or overwrite Skill files. It preserves a valid token, exchanges the new code only when credentials are missing or rejected, and preserves the existing token when network failure makes validation inconclusive. Updates to `apiBase` and `token` preserve unrelated fields in `~/.canvas/config.json`; its mode remains 600.

## After setup

| Command | Action |
|---------|--------|
| `/mekari-canvas publish <file>` | Create or auto-Replace Share (uses `~/.canvas/publish-manifest.json`) |
| `/mekari-canvas publish --new <file>` | Force new Share |
| `/mekari-canvas replace <file> <slug>` | Replace specific slug |
| `/mekari-canvas list` | List your Shares |
| `/mekari-canvas delete <slug>` | Delete a Share |

## Local config files

- `~/.canvas/config.json` — API base + Bearer token (harness-agnostic)
- `~/.canvas/publish-manifest.json` — absolute file path → slug mapping for auto-Replace

Playwright traces are sent as raw ZIP bytes through a once-only, immutable direct upload URL and expire 30 days after first publish. A failed commit retry mints a fresh upload URL. Replacing a trace preserves the original expiration; if an expired Share has already been swept, the helper creates a new Share and updates the manifest.

## Refresh

Choose **Add skill** again to run the same global Skills CLI command. Managed Skill files refresh across all three Agent surfaces. Unrelated files and a valid shared token remain untouched.
