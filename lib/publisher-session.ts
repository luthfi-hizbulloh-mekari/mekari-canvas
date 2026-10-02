import { auth } from "@/lib/auth";
import { devBypassEmail } from "@/lib/dev-bypass";
import { isMekariEmail } from "@/lib/mekari-email";
import { validateBearerToken } from "@/lib/token-store";

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

export const MEKARI_SIGN_IN_REQUIRED = "Mekari sign-in required";
export const MEKARI_SIGN_IN_OR_TOKEN_REQUIRED = "Mekari sign-in or Publisher API token required";

/** Bearer-only identity: no session cookie, no dev bypass (Raw trace endpoint). */
export async function getTokenPublisherEmail(req: Request): Promise<string | null> {
  const token = bearerToken(req);
  return token ? validateBearerToken(token) : null;
}

export type PublisherIdentity = { email: string; via: "session" | "token" };

/** Single identity-resolution point: session cookie or Publisher API Bearer token. */
export async function getPublisherIdentity(req: Request): Promise<PublisherIdentity | null> {
  const bypass = devBypassEmail();
  if (bypass) return { email: bypass, via: "session" };

  if (bearerToken(req)) {
    const email = await getTokenPublisherEmail(req);
    return email ? { email, via: "token" } : null;
  }

  const email = await publisherEmailFromSession(req);
  return email ? { email, via: "session" } : null;
}

export async function getPublisherEmail(req: Request): Promise<string | null> {
  return (await getPublisherIdentity(req))?.email ?? null;
}

/** Session-only identity (setup code mint, token list/revoke). */
export async function getSessionPublisherEmail(req: Request): Promise<string | null> {
  const bypass = devBypassEmail();
  if (bypass) return bypass;
  return publisherEmailFromSession(req);
}
