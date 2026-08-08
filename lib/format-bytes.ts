const DECIMAL_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

export function formatBytes(bytes: number): string {
  if (bytes < 1_000) return `${bytes} B`;

  const unit = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1_000)),
    DECIMAL_UNITS.length - 1
  );
  return `${(bytes / 1_000 ** unit).toFixed(1)} ${DECIMAL_UNITS[unit]}`;
}
