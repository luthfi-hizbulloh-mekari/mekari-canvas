const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_FILE_SIGNATURE = 0x02014b50;
const EOCD_MIN_BYTES = 22;
const MAX_ZIP_COMMENT_BYTES = 0xffff;

export const ZIP_TAIL_BYTES = EOCD_MIN_BYTES + MAX_ZIP_COMMENT_BYTES;
export const MAX_CENTRAL_DIRECTORY_BYTES = 4 * 1024 * 1024;

export type CentralDirectory = {
  offset: number;
  size: number;
  entries: number;
  eocdOffset: number;
};

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

export function locateCentralDirectory(
  tail: Uint8Array,
  totalSize: number
): CentralDirectory | null {
  if (tail.length < EOCD_MIN_BYTES || totalSize < tail.length) return null;
  const data = view(tail);
  const tailOffset = totalSize - tail.length;

  for (let at = tail.length - EOCD_MIN_BYTES; at >= 0; at--) {
    if (data.getUint32(at, true) !== EOCD_SIGNATURE) continue;
    const commentBytes = data.getUint16(at + 20, true);
    if (at + EOCD_MIN_BYTES + commentBytes !== tail.length) continue;

    const disk = data.getUint16(at + 4, true);
    const centralDisk = data.getUint16(at + 6, true);
    const entriesOnDisk = data.getUint16(at + 8, true);
    const entries = data.getUint16(at + 10, true);
    const size = data.getUint32(at + 12, true);
    const offset = data.getUint32(at + 16, true);
    if (disk !== 0 || centralDisk !== 0 || entriesOnDisk !== entries) return null;
    if (entries === 0xffff || size === 0xffffffff || offset === 0xffffffff) return null;

    const eocdOffset = tailOffset + at;
    if (offset + size > eocdOffset) return null;
    return { offset, size, entries, eocdOffset };
  }
  return null;
}

export function validateTraceDirectory(
  bytes: Uint8Array,
  directory: CentralDirectory,
  bytesOffset: number
): string | null {
  const invalid = "ZIP is not a recognized Playwright trace";
  if (
    directory.size > MAX_CENTRAL_DIRECTORY_BYTES ||
    directory.offset < bytesOffset ||
    directory.offset + directory.size > bytesOffset + bytes.length
  ) {
    return invalid;
  }

  const data = view(bytes);
  const decoder = new TextDecoder();
  let cursor = directory.offset - bytesOffset;
  const directoryEnd = cursor + directory.size;
  let traceEntry = false;
  let networkEntry = false;

  for (let entry = 0; entry < directory.entries; entry++) {
    if (cursor < 0 || cursor + 46 > directoryEnd || cursor + 46 > bytes.length) return invalid;
    if (data.getUint32(cursor, true) !== CENTRAL_FILE_SIGNATURE) return invalid;

    const flags = data.getUint16(cursor + 8, true);
    if ((flags & 1) !== 0) return invalid;

    const nameBytes = data.getUint16(cursor + 28, true);
    const extraBytes = data.getUint16(cursor + 30, true);
    const commentBytes = data.getUint16(cursor + 32, true);
    const next = cursor + 46 + nameBytes + extraBytes + commentBytes;
    if (next > directoryEnd || next > bytes.length) return invalid;

    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameBytes));
    traceEntry ||= /(^|\/)[^/]*\.trace$/.test(name);
    networkEntry ||= /(^|\/)[^/]*\.network$/.test(name);
    cursor = next;
  }

  if (cursor !== directoryEnd || !traceEntry || !networkEntry) return invalid;
  return null;
}

export function validateTraceArchive(tail: Uint8Array, totalSize: number): string | null {
  const directory = locateCentralDirectory(tail, totalSize);
  if (!directory) return "ZIP is not a recognized Playwright trace";
  return validateTraceDirectory(tail, directory, totalSize - tail.length);
}
