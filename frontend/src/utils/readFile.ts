/**
 * Read an uploaded file as UTF-8 text.
 *
 * `Blob.text()` would be shorter, but it is missing on Safari before 14 and on
 * the older Android tablets this POS gets installed on — a restore that silently
 * reports "not valid JSON" there would be worse than a few extra lines here.
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));
    reader.readAsText(file);
  });
}
