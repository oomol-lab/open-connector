/** Budget source scans by file count without changing ordinary unit-test timeouts. */
export function sourceScanTimeout(fileCount: number): number {
  return Math.max(5_000, fileCount * 5);
}
