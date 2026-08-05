import path from "path";

export const STAGING_PREFIX = "staging/";
export const STAGING_RETENTION_MS = 60 * 60 * 1000;

export function stagedTracePath(uploadId: string): string {
  return `${STAGING_PREFIX}${uploadId}.zip`;
}

export function localStagedTraceFile(uploadId: string): string {
  return path.join(process.cwd(), ".data", stagedTracePath(uploadId));
}
