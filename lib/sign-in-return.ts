// One allowlist for post-sign-in return targets, shared by the Short link guard and the
// sign-in page. Narrower than Better Auth's callbackURL check, so it never trips it.
const SLUG_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const SHORT_LINK_PATH = /^\/s\/[A-Za-z0-9_-]{1,64}$/;

export function signInPathFor(slug: string): string {
  if (!SLUG_PATTERN.test(slug)) return "/sign-in";
  return `/sign-in?callbackURL=${encodeURIComponent(`/s/${slug}`)}`;
}

export function safeReturnPath(raw: string | null): string {
  if (raw === "/" || (raw !== null && SHORT_LINK_PATH.test(raw))) return raw;
  return "/";
}
