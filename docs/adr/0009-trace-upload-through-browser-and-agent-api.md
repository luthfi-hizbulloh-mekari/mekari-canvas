# Playwright traces are supported by both publish paths

Playwright Trace Artifacts are first-class inputs for both the signed-in homepage upload flow and the harness-agnostic Agent API used by `/mekari-canvas`. Both paths create and Replace the same Share type and apply the same 50 MB limit, structure validation, public viewer link, and 30-day expiration rules.

**Why:** traces are generated both by engineers using the Canvas UI and by tests/agents that already publish Markdown through the Agent API. Supporting only one path would make the new Artifact kind inconsistent with Canvas's existing publishing model.

**Consequences:** the Agent API and setup skill need a binary upload contract, while the homepage must use an upload path that supports the 50 MB limit.
