import { describe, expect, it, vi } from "vitest";
import {
  MAX_CENTRAL_DIRECTORY_BYTES,
  ZIP_TAIL_BYTES,
} from "@/lib/trace-archive";
import {
  inspectStagedTrace,
  InvalidStagedTraceError,
  isUploadId,
  UPLOAD_ID_LENGTH,
} from "@/lib/trace-staging";

function little16(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function little32(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function centralEntry(name: string): number[] {
  const nameBytes = [...new TextEncoder().encode(name)];
  return [
    ...little32(0x02014b50),
    ...little16(20),
    ...little16(20),
    ...little16(0),
    ...little16(0),
    ...little16(0),
    ...little16(0),
    ...little32(0),
    ...little32(0),
    ...little32(0),
    ...little16(nameBytes.length),
    ...little16(0),
    ...little16(0),
    ...little16(0),
    ...little16(0),
    ...little32(0),
    ...little32(0),
    ...nameBytes,
  ];
}

function eocd(directoryOffset: number, directorySize: number, entries: number): Uint8Array {
  return Uint8Array.from([
    ...little32(0x06054b50),
    ...little16(0),
    ...little16(0),
    ...little16(entries),
    ...little16(entries),
    ...little32(directorySize),
    ...little32(directoryOffset),
    ...little16(0),
  ]);
}

function tailWithEocd(totalSize: number, record: Uint8Array): Uint8Array {
  const tail = new Uint8Array(Math.min(totalSize, ZIP_TAIL_BYTES));
  tail.set(record, tail.length - record.length);
  return tail;
}

describe("trace staging", () => {
  it("keeps upload ID generation and validation on one length constant", () => {
    expect(UPLOAD_ID_LENGTH).toBe(21);
    expect(isUploadId("a".repeat(UPLOAD_ID_LENGTH))).toBe(true);
    expect(isUploadId("a".repeat(UPLOAD_ID_LENGTH - 1))).toBe(false);
    expect(isUploadId(`${"a".repeat(UPLOAD_ID_LENGTH - 1)}!`)).toBe(false);
  });

  it("validates a central directory outside the ZIP tail with one bounded reread", async () => {
    const directoryOffset = 100;
    const directory = Uint8Array.from([
      ...centralEntry("trace.trace"),
      ...centralEntry("trace.network"),
    ]);
    const totalSize = 100_000;
    const tailStart = totalSize - ZIP_TAIL_BYTES;
    const tail = tailWithEocd(
      totalSize,
      eocd(directoryOffset, directory.length, 2)
    );
    const reads: Array<[number, number]> = [];
    const storage = {
      stagedTraceSize: vi.fn(async () => totalSize),
      readStagedTraceRange: vi.fn(async (_uploadId: string, start: number, end: number) => {
        reads.push([start, end]);
        if (start === tailStart) return tail;
        if (start === directoryOffset) return directory;
        throw new Error("unexpected range");
      }),
    };

    await expect(inspectStagedTrace(storage, "upload-id")).resolves.toBe(totalSize);
    expect(reads).toEqual([
      [tailStart, totalSize - 1],
      [directoryOffset, directoryOffset + directory.length - 1],
    ]);
  });

  it("rejects an oversized central directory before buffering it", async () => {
    const directorySize = MAX_CENTRAL_DIRECTORY_BYTES + 1;
    const totalSize = directorySize + 22;
    const tailStart = totalSize - ZIP_TAIL_BYTES;
    const tail = tailWithEocd(totalSize, eocd(0, directorySize, 2));
    const read = vi.fn(async (_uploadId: string, start: number) => {
      if (start === tailStart) return tail;
      throw new Error("central directory must not be read");
    });

    await expect(
      inspectStagedTrace(
        { stagedTraceSize: async () => totalSize, readStagedTraceRange: read },
        "upload-id"
      )
    ).rejects.toBeInstanceOf(InvalidStagedTraceError);
    expect(read).toHaveBeenCalledTimes(1);
  });
});
