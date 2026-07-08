import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";

const MEKARI_SUFFIX = "@mekari.com";
const THIRTY_DAYS = 60 * 60 * 24 * 30;

export function isMekariEmail(email: string | undefined | null): boolean {
  return !!email && email.toLowerCase().endsWith(MEKARI_SUFFIX);
}

function authSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (secret) return secret;
  if (process.env.VERCEL === "1") {
    throw new Error("BETTER_AUTH_SECRET is required on Vercel");
  }
  return "local-dev-secret-at-least-32-characters";
}

function requireOnVercel(name: string, value: string | undefined): string {
  if (value) return value;
  if (process.env.VERCEL === "1") {
    throw new Error(`${name} is required on Vercel`);
  }
  return "";
}

function rejectNonMekariEmail(email: string | undefined | null): void {
  if (!isMekariEmail(email)) {
    throw new APIError("FORBIDDEN", {
      message: "Only @mekari.com Google accounts can sign in",
    });
  }
}

export const auth = betterAuth({
  secret: authSecret(),
  baseURL: process.env.BETTER_AUTH_URL,
  session: {
    expiresIn: THIRTY_DAYS,
  },
  socialProviders: {
    google: {
      clientId: requireOnVercel("GOOGLE_CLIENT_ID", process.env.GOOGLE_CLIENT_ID),
      clientSecret: requireOnVercel("GOOGLE_CLIENT_SECRET", process.env.GOOGLE_CLIENT_SECRET),
      hd: "mekari.com",
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          rejectNonMekariEmail(user.email);
        },
      },
    },
    session: {
      create: {
        before: async (session, ctx) => {
          if (!ctx) return false;
          const user = await ctx.context.internalAdapter.findUserById(session.userId);
          rejectNonMekariEmail(user?.email);
        },
      },
    },
  },
  plugins: [nextCookies()],
});
