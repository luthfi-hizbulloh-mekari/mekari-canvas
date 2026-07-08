# Better Auth for Publisher sign-in

Canvas uses Better Auth with Google OAuth (`hd: mekari.com`) and stateless cookie sessions for **Publisher sign-in**. Replaces the shared **Organization code** gate on publish/delete.

**Considered options:** Auth.js v5 (same ecosystem — Better Auth now stewards Auth.js), roll-your-own Google OAuth, hosted auth (Clerk/Auth0 — overkill for internal `@mekari.com` gate).

**Why Better Auth:** Vercel-aligned (acquired Jul 2026), built-in Google Workspace `hd` enforcement, stateless sessions without adding a user database (fits Blob + KV only), optional Upstash Redis as secondary session store later.

**Consequences:** Publish/delete APIs must still verify `@mekari.com` server-side — do not rely on `hd` alone. Homepage requires sign-in before paste/upload. Legacy Shares without **Published by** grandfather Replace/Delete for any `@mekari.com` + valid **Browser edit token**.

**Local development:** Optional env bypass (`DEV_PUBLISHER_EMAIL`) substitutes Google OAuth on local `next dev` only when `NODE_ENV=development` **and** `DEV_AUTH_BYPASS=true` — must never activate on Vercel production.

**Session:** 30-day stateless cookie TTL.

**Sign-in flow:** Dedicated `/sign-in` page with Google button. Middleware redirects unauthenticated `/` requests to `/sign-in`; `/s/*` and `/api/auth/*` stay public.

**Google OAuth (production):** Personal GCP project with a Web OAuth client (simplest for solo maintainer). Credentials in Vercel env vars. `hd: mekari.com` + server-side email check. Mekari shared internal-tools GCP project is an alternative if IT mandates it later.
