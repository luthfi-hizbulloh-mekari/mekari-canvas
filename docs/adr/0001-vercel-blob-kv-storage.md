# Vercel Blob + KV for Artifact storage

Canvas stores Share HTML bodies in Vercel Blob and slug metadata (blob path, edit token hash, created_at) in Vercel KV. Chosen for v1 to keep storage, compute, and deploy on one Vercel account with minimal setup.

**Considered options:** Cloudflare R2 (cheaper at scale, extra vendor), Postgres-only (poor fit for 500 KB HTML blobs), git commits per Share (wrong tool).

**Consequences:** Hobby tier caps at 1 GB storage, 2,000 blob writes/month, 10,000 blob reads/month. Migrate to R2 or Pro if adoption outgrows free tier.
