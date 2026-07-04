export function checkUploadGate(req: Request): boolean {
  const secret = process.env.UPLOAD_GATE_SECRET || "mekari";
  return req.headers.get("x-upload-gate") === secret;
}
