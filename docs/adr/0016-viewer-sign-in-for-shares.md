# Require Viewer sign-in for every Share

Viewing any Share — HTML, Markdown, or Playwright trace, including Shares published before this change — now requires being a **Viewer**: **Mekari sign-in** (the existing Better Auth Google OAuth, `@mekari.com` only) in the browser, or a valid **Publisher API token** for agents. This reverses the v1 position that "org-only" meant link discipline plus unguessable slugs; Short links were being forwarded outside Mekari and unfurled by third-party previewers. Supersedes ADR-0003's "`/s/*` stays public" and ADR-0012's public Raw trace endpoint.

**Browser flow:** a Short link opened without a session redirects to `/sign-in` and returns to the same Short link after sign-in. Authentication is checked before Share lookup so outsiders cannot distinguish live, expired, and missing slugs. Only browser page navigations are redirected — `Sec-Fetch-Mode: navigate`, or no Fetch Metadata and `Accept` containing `text/html`; other requests without a session or token receive a plain-text `401` pointing agents at `/mekari-canvas read` instead of a sign-in page they would mistake for content.

**Agents:** Markdown Artifacts exist for agent consumption (ADR-0002), and agents have no browser cookie. Short links accept `Authorization: Bearer <Publisher API token>`; any valid token reads any Share, matching the browser rule that any Mekari sign-in reads everything. The Skill package gains a `read` subcommand and a new version; older packages get the existing Skill refresh guidance on `401` rather than a raised Minimum Skill package version, since reading is the only thing they lose.

**Playwright traces:** `trace.playwright.dev` fetches the Raw trace endpoint cross-origin and can never carry a Canvas cookie. After the Viewer is authenticated at the Short link, the redirect embeds a **Trace viewer grant** valid for about 10 minutes; the Raw trace endpoint accepts only that grant or a Publisher API token.

**HTML sandbox:** HTML Artifacts are served raw on the app origin. With every Viewer now holding a Canvas session, an Artifact's script could call the publish, delete, setup-code, and token APIs as the Viewer. HTML Shares are therefore served with a CSP `sandbox` directive without `allow-same-origin`, putting the page on an opaque origin.

**Considered options:**

- *Per-Share visibility chosen by the Publisher* — rejected; Viewers can't tell which links are protected and Publishers forget the toggle.
- *Exempt Markdown or trace Shares* — rejected; Markdown PR summaries are the most-forwarded content.
- *Self-host Trace Viewer on the Canvas origin* — cleaner (cookie-authenticated fetch), but requires pinning and upgrading a copy of the viewer; deferred.
- *Separate user-content origin for Artifacts* — stronger isolation than CSP sandbox, but needs its own auth handoff; deferred.
- *Signed expiring URLs for agents* — rejected; agents using the Skill already hold a Publisher API token.

**Consequences:** Slack/Confluence link previews no longer show content. Agents without the Canvas Skill package cannot read Short links. HTML Artifacts that depend on `localStorage`, cookies, or same-origin requests break under the sandbox. Rollout is a single cutover announced internally, with no warning period. The guard relies on Artifact Blobs being private: HTML and Markdown Blobs default to public access unless `BLOB_STORE_ACCESS=private` is set, which production does (verified 2026-10-02; set for Production and Preview since 2026-06-11, alongside the KV store). A deployment without it would let anyone who learns the Blob hostname and a slug bypass the guard. The local `DEV_AUTH_BYPASS` substitute applies to viewing as it does to publishing.
