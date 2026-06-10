export const MAX_ARTIFACT_BYTES = 500 * 1024;

export function checkUploadGate(req: Request): boolean {
  const secret = process.env.UPLOAD_GATE_SECRET || "mekari";
  return req.headers.get("x-upload-gate") === secret;
}

export function validateArtifact(html: string): string | null {
  if (Buffer.byteLength(html, "utf8") > MAX_ARTIFACT_BYTES) {
    return "Artifact exceeds 500 KB";
  }
  const head = html.slice(0, 2048).toLowerCase();
  if (!head.includes("<html") && !head.includes("<!doctype")) {
    return "Artifact must contain <html or <!DOCTYPE";
  }
  return null;
}
