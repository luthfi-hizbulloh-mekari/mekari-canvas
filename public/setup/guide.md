# Mekari Canvas — Agent setup

One-time setup connects your harness to **Agent publish** on Mekari Canvas.

## What you need

1. **Setup manifest URL** — thin JSON listing API base and skill file URLs
2. **Setup code** — one-time code from the Canvas homepage **Add skill** button (expires in ~10 minutes)

The setup code is **never** embedded in the manifest. Exchange it once for a long-lived **Publisher API token**.

## Copy-paste prompt (Cursor or any agent)

```
Set up Mekari Canvas agent publish:

1. Fetch the setup manifest: {MANIFEST_URL}
2. Download each file listed in manifest.files[] to ~/.cursor/skills/mekari-canvas/ (preserve paths)
3. POST to {API_BASE}/api/setup/exchange with JSON body: { "code": "{SETUP_CODE}", "label": "Cursor" }
4. Save the returned token to ~/.canvas/config.json as { "apiBase": "<apiBase>", "token": "<token>" }
5. Confirm: run ~/.cursor/skills/mekari-canvas/scripts/mekari-canvas.sh list

After setup, invoke /mekari-canvas publish on a .md or .html file to get a Short link.
```

Replace `{MANIFEST_URL}`, `{API_BASE}`, and `{SETUP_CODE}` with values from the homepage.

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

## Re-install

Click **Add skill** again on the homepage to refresh skill files after API changes. Each setup mints a new token (revoke old ones on the site if unused).
