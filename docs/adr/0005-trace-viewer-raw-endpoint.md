# Playwright Trace Shares use a viewer link plus a raw trace endpoint

Playwright Trace Shares keep `/s/{slug}` as the canonical Short link but redirect it to `trace.playwright.dev` with a separate Raw trace endpoint as the remote trace URL. A single URL cannot both redirect a human to the external viewer and return the ZIP the viewer must fetch; the split also preserves the existing HTML/Markdown Short link behavior.

**Considered options:** (1) serve the ZIP directly from `/s/{slug}` — users would download or see an unusable binary response; (2) redirect `/s/{slug}` and make the viewer fetch that same URL — creates a redirect loop; (3) host a Canvas-native viewer — unnecessary lock-in while Playwright provides the interactive viewer.

**Consequences:** the raw endpoint must return `application/zip` and satisfy the external viewer's CORS requirements. The Short link and raw endpoint share the same Share authorization and lifecycle.
