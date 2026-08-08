# Enforce trace expiration at read time and with a daily sweeper

Canvas enforces a Playwright Trace Share's 30-day deadline in both public read paths and scheduled cleanup. The Short link and Raw trace endpoint return 404 as soon as `expiresAt` is reached, while a protected daily Vercel Cron deletes the ZIP, metadata, and publisher index entry. The cleanup is idempotent and does not serve as the only enforcement mechanism.

**Why:** Vercel Cron timing is approximate and failed jobs are not automatically retried; relying on the job alone could leave an expired public trace reachable. The read-time check guarantees the product promise, while the sweep bounds storage.

Superseded in part by ADR 0014
