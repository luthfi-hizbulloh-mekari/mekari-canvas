# Playwright Trace Artifacts use a separate 50 MB size cap

HTML and Markdown Artifacts retain Canvas's 500 KB limit, while Playwright Trace Artifacts may be up to 50 MB. Traces bundle screenshots, snapshots, source, and diagnostic data, so the existing text-artifact limit would reject useful traces; the lower cap for other artifacts remains unchanged. The 50 MB ceiling bounds the storage impact of publicly shareable traces, alongside their 30-day expiration.

**Consequences:** trace uploads require a binary-capable upload path rather than the current JSON string body, and the UI/API must report the trace-specific limit separately from the 500 KB text limit.
