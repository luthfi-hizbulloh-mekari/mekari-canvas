# Playwright traces use a binary upload contract

The homepage and Agent API accept Playwright Trace Artifacts as ZIP file uploads, rather than forcing callers to encode them as JSON strings or base64. The transport may use a direct Blob upload/session for payloads above the Vercel Function request limit, but the caller-facing contract remains a binary file upload and the Share is committed only after the upload and trace validation succeed.

**Why:** traces are binary and may be up to 50 MB; text encoding would add overhead, complicate clients, and fail through the existing JSON route. A direct upload path avoids the 4.5 MB Function request limit while preserving one Share model.
