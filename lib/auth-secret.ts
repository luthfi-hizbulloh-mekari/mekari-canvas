export function authSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (secret) return secret;
  if (process.env.VERCEL === "1") {
    throw new Error("BETTER_AUTH_SECRET is required on Vercel");
  }
  return "local-dev-secret-at-least-32-characters";
}
