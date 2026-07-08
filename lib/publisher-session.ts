import { auth, isMekariEmail } from "@/lib/auth";
import { validateBearerToken } from "@/lib/token-store";

function devBypassEmail(): string | null {
  const bypassEnabled = process.env.DEV_AUTH_BYPASS === "true";
  const email = process.env.DEV_PUBLISHER_EMAIL?.trim();

  if (process.env.VERCEL === "1") {
    return null;
  }

  if (!bypassEnabled || !email || !isMekariEmail(email)) {
    return null;
  }

  return email.toLowerCase();
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

async function publisherEmailFromSession(req: Request): Promise<string | null> {
  const session = await auth.api.getSession({ headers: req.headers });
  const email = session?.user?.email;
  if (!email || !isMekariEmail(email)) return null;
  return email.toLowerCase();
}

/** Single identity-resolution point: session cookie or Publisher API Bearer token. */
export async function getPublisherEmail(req: Request): Promise<string | null> {
  const bypass = devBypassEmail();
  if (bypass) return bypass;

  const token = bearerToken(req);
  if (token) {
    return validateBearerToken(token);
  }

  return publisherEmailFromSession(req);
}

/** Session-only identity (setup code mint, token list/revoke). */
export async function getSessionPublisherEmail(req: Request): Promise<string | null> {
  const bypass = devBypassEmail();
  if (bypass) return bypass;
  return publisherEmailFromSession(req);
}
