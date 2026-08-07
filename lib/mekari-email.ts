const MEKARI_SUFFIX = "@mekari.com";

export function isMekariEmail(email: string | undefined | null): boolean {
  return !!email && email.toLowerCase().endsWith(MEKARI_SUFFIX);
}
