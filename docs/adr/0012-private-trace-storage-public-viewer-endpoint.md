# Keep trace storage private behind a public viewer endpoint

Playwright Trace Artifact ZIPs remain in private Blob storage. Canvas exposes a separate anonymous Raw trace endpoint that checks expiration, streams the ZIP as `application/zip`, and includes the CORS response required by `trace.playwright.dev`; the canonical Short link redirects to the viewer with that endpoint as its remote trace URL.

**Why:** the Share is intentionally public, but exposing the underlying Blob URL would bypass Canvas's expiration check and make storage paths part of the sharing contract. A Canvas-mediated endpoint preserves the public viewer experience while keeping storage access and lifecycle under Canvas control.

**Consequences:** the endpoint must support the viewer's remote fetch semantics, including CORS and binary response headers, and Canvas carries the response-streaming work for trace views.

The Raw trace endpoint is intentionally public to anyone holding the Share link; the redirect is a preferred viewing experience, not an access-control or download-prevention mechanism.
