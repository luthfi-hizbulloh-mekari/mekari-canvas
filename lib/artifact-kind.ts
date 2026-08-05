export const ARTIFACT_KIND = {
  html: {
    ext: ".html",
    contentType: "text/html; charset=utf-8",
    maxBytes: 500 * 1024,
  },
  md: {
    ext: ".md",
    contentType: "text/markdown; charset=utf-8",
    maxBytes: 500 * 1024,
  },
  trace: {
    ext: ".zip",
    contentType: "application/zip",
    maxBytes: 50 * 1024 * 1024,
  },
} as const;

export type ArtifactKind = keyof typeof ARTIFACT_KIND;
export type TextArtifactKind = Exclude<ArtifactKind, "trace">;

export function isArtifactKind(value: unknown): value is ArtifactKind {
  return typeof value === "string" && Object.hasOwn(ARTIFACT_KIND, value);
}
