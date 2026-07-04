export type ArtifactKind = "html" | "md";

export const ARTIFACT_KIND = {
  html: { ext: ".html", contentType: "text/html; charset=utf-8" },
  md: { ext: ".md", contentType: "text/markdown; charset=utf-8" },
} as const;

export function isArtifactKind(value: unknown): value is ArtifactKind {
  return typeof value === "string" && Object.hasOwn(ARTIFACT_KIND, value);
}
