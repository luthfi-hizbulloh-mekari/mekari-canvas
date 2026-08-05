import { ARTIFACT_KIND, type TextArtifactKind } from "@/lib/artifact-kind";

export function artifactBytes(body: string): number {
  return new TextEncoder().encode(body).byteLength;
}

function looksLikeHtml(body: string): boolean {
  const head = body.slice(0, 2048).toLowerCase();
  return head.includes("<html") || head.includes("<!doctype");
}

export function validateTextArtifact(body: string, kind: TextArtifactKind): string | null {
  if (artifactBytes(body) > ARTIFACT_KIND[kind].maxBytes) {
    return `Artifact exceeds ${ARTIFACT_KIND[kind].maxBytes / 1024} KB`;
  }

  if (kind === "html" && !looksLikeHtml(body)) {
    return "Artifact must contain <html or <!DOCTYPE";
  }

  if (kind === "md" && body.trim().length === 0) {
    return "Markdown Artifact cannot be empty";
  }

  return null;
}

export function detectTextArtifactKind(content: string, filename?: string): TextArtifactKind {
  const lowerName = filename?.toLowerCase() ?? "";
  if (lowerName.endsWith(".html") || lowerName.endsWith(".htm")) {
    return "html";
  }
  if (lowerName.endsWith(".md")) {
    return "md";
  }
  return looksLikeHtml(content) ? "html" : "md";
}
