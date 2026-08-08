import { describe, expect, it } from "vitest";
import { formatBytes } from "@/lib/format-bytes";

describe("formatBytes", () => {
  it.each([
    [999, "999 B"],
    [1_000, "1.0 KB"],
    [1_000_000, "1.0 MB"],
    [1_500_000, "1.5 MB"],
  ])("formats %i bytes using decimal units", (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});
