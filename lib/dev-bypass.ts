import { isMekariEmail } from "@/lib/mekari-email";

export function devBypassEmail(): string | null {
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
