export function getApiBase(req?: Request): string {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL.replace(/\/$/, "");
  if (req) {
    const url = new URL(req.url);
    return url.origin;
  }
  return "https://mekari-canvas.vercel.app";
}
