import { ARTIFACT_KIND } from "@/lib/artifact-kind";
import type { StorageDriver } from "@/lib/storage";
import {
  locateCentralDirectory,
  MAX_CENTRAL_DIRECTORY_BYTES,
  validateTraceArchive,
  validateTraceDirectory,
  ZIP_TAIL_BYTES,
} from "@/lib/trace-archive";

export const UPLOAD_ID_LENGTH = 21;
const UPLOAD_ID_PATTERN = new RegExp(`^[A-Za-z0-9_-]{${UPLOAD_ID_LENGTH}}$`);
const INVALID_TRACE_MESSAGE = "ZIP is not a recognized Playwright trace";

type StagedTraceReader = Pick<
  StorageDriver,
  "stagedTraceSize" | "readStagedTraceRange"
>;

export class InvalidStagedTraceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidStagedTraceError";
  }
}

export function isUploadId(value: unknown): value is string {
  return typeof value === "string" && UPLOAD_ID_PATTERN.test(value);
}

/**
 * Validates a staged trace with bounded range reads and returns its stored size.
 * Storage-specific staging I/O stays behind StorageDriver so this logic is testable.
 */
export async function inspectStagedTrace(
  storage: StagedTraceReader,
  uploadId: string
): Promise<number> {
  const size = await storage.stagedTraceSize(uploadId);
  if (size > ARTIFACT_KIND.trace.maxBytes) {
    throw new InvalidStagedTraceError("Artifact exceeds 50 MB");
  }
  if (size < 22) throw new InvalidStagedTraceError(INVALID_TRACE_MESSAGE);

  const tailStart = Math.max(0, size - ZIP_TAIL_BYTES);
  const tail = await storage.readStagedTraceRange(uploadId, tailStart, size - 1);
  const directory = locateCentralDirectory(tail, size);

  let validationError: string | null;
  if (directory && directory.offset < tailStart) {
    if (
      directory.size === 0 ||
      directory.size > MAX_CENTRAL_DIRECTORY_BYTES
    ) {
      throw new InvalidStagedTraceError(INVALID_TRACE_MESSAGE);
    }
    const centralDirectory = await storage.readStagedTraceRange(
      uploadId,
      directory.offset,
      directory.offset + directory.size - 1
    );
    validationError = validateTraceDirectory(
      centralDirectory,
      directory,
      directory.offset
    );
  } else {
    validationError = validateTraceArchive(tail, size);
  }

  if (validationError) throw new InvalidStagedTraceError(validationError);
  return size;
}
