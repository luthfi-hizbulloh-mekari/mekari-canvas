import { auth, isMekariEmail } from "@/lib/auth";

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

export async function getPublisherEmail(req: Request): Promise<string | null> {
  const bypass = devBypassEmail();
  if (bypass) return bypass;

  const session = await auth.api.getSession({ headers: req.headers });
  const email = session?.user?.email;
  if (!email || !isMekariEmail(email)) return null;
  return email.toLowerCase();
}
