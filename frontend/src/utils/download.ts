/**
 * Save an in-memory blob to disk.
 *
 * The API is bearer-token authenticated, so a plain `<a href="/api/...">` would
 * arrive unauthenticated — files are fetched through axiosClient and handed to
 * this helper instead.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  // Firefox only starts the download once the anchor is in the document.
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoke on the next tick so the browser has had a chance to read the blob.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** `pos-backup-2026-09-17T10-37-37.json` — a name the operator can sort by. */
export function timestampedFilename(prefix: string, extension: string, date = new Date()): string {
  const stamp = date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `${prefix}-${stamp}.${extension}`;
}

/** `pos-orders-2026-09-17.csv` */
export function datedFilename(prefix: string, extension: string, date = new Date()): string {
  return `${prefix}-${date.toISOString().slice(0, 10)}.${extension}`;
}
