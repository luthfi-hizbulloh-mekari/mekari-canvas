import type { ArtifactKind } from "@/lib/artifact-kind";

export const MAX_ARTIFACT_BYTES = 500 * 1024;

export function artifactBytes(body: string): number {
  return new TextEncoder().encode(body).byteLength;
}

function looksLikeHtml(body: string): boolean {
  const head = body.slice(0, 2048).toLowerCase();
  return head.includes("<html") || head.includes("<!doctype");
}

export function validateArtifact(body: string, kind: ArtifactKind): string | null {
  if (artifactBytes(body) > MAX_ARTIFACT_BYTES) {
    return "Artifact exceeds 500 KB";
  }

  if (kind === "html" && !looksLikeHtml(body)) {
    return "Artifact must contain <html or <!DOCTYPE";
  }

  if (kind === "md" && body.trim().length === 0) {
    return "Markdown Artifact cannot be empty";
  }

  return null;
}

export function detectArtifactKind(content: string, filename?: string): ArtifactKind {
  const lowerName = filename?.toLowerCase() ?? "";
  if (lowerName.endsWith(".html") || lowerName.endsWith(".htm")) {
    return "html";
  }
  if (lowerName.endsWith(".md")) {
    return "md";
  }
  return looksLikeHtml(content) ? "html" : "md";
}
