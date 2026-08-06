# Distribute the Mekari Canvas skill through the standard Skills CLI

The public `mekari-canvas` repository is the canonical Skill package source. **Add skill** launches a selected agent only as the prompt destination; the prompt installs or refreshes `mekari-canvas` globally for Cursor, Claude Code, and Codex CLI with the standard Skills CLI, while the Canvas setup command only exchanges or reuses one shared Publisher API token in `~/.canvas/config.json`.

**Why:** this matches the open Agent Skills ecosystem, gives peers a normal global install/update path, and removes agent-specific file-copy logic from Canvas. The setup manifest now contains only the API base and token-exchange endpoint; it is not a Skill file catalog.

**Consequences:** the repository must stay publicly installable and the skill must remain compatible with all three agents. The setup manifest is deployment-relative so preview codes do not leak into production exchange. A refresh updates all three installations, and revoking the shared token disables Agent publish for all three on that machine.
