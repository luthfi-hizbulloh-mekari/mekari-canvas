# Validate Playwright trace archives before storage

Canvas accepts `.zip` uploads as Playwright Trace Artifacts only when a best-effort server-side check recognizes a supported Playwright trace structure. Arbitrary ZIPs are rejected before storage; validation inspects archive metadata and known entries without extracting or executing the payload, and does not pin the upload to one Playwright release. The validator should evolve as Playwright adds compatible trace layouts, but an unrecognized archive is not silently accepted as a generic ZIP.

**Why:** the feature is intentionally for Playwright traces, not general file hosting, and storing arbitrary archives would weaken the product boundary and consume limited storage. Keeping validation structural avoids needing Canvas to run or render untrusted trace contents.

**Consequences:** valid traces from future Playwright versions may require validator updates; upload errors must explain that the ZIP is not recognized as a supported Playwright trace.
