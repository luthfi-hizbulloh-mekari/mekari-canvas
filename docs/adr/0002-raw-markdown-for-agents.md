# Raw Markdown storage and serving for agents

Canvas supports **Markdown Artifacts** alongside HTML. Markdown is stored as raw `.md` in Blob and served at the same `/s/{slug}` Short link with `Content-Type: text/markdown` — no server-side or client-side rendering.

**Why not compile at publish?** Markdown Shares target **agents** (fetch body, parse locally), not human readers in a browser. Rendering at publish would bake in styling assumptions and lose the original source agents expect.

**Why not render on serve?** Same problem, plus a runtime dependency on every view and a harder contract to keep stable for automated consumers.

**Considered options:** (1) compile md → HTML at publish and keep HTML-only storage — rejected because agents need raw md; (2) render HTML on each GET while storing md — rejected for serve-time complexity and unstable output; (3) separate `/m/{slug}` path — rejected; one Short link shape is simpler for agents (`Content-Type` signals kind).

**Consequences:** Markdown Shares look unstyled when opened in a browser — acceptable by design. **Artifact kind** (`html` | `md`) is immutable on **Replace** so agents can rely on a stable content type per slug. Existing Shares without `kind` in KV default to `html`.

See `CONTEXT.md` for glossary and detection rules (extension on upload, sniff on paste).
