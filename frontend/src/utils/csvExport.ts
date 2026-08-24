const BOM = '\uFEFF';

export interface CsvMetaOptions {
  title?: string;
  meta?: string[];
}

export interface RecordsCsvOptions extends CsvMetaOptions {
  columns?: string[];
  headers?: string[];
}

const humanizeKey = (key: string): string =>
  key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());

const formatCell = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

const escapeCell = (raw: string): string => {
  const escaped = raw.replace(/"/g, '""');
  return /[",\r\n]/.test(escaped) ? `"${escaped}"` : escaped;
};

const buildCsv = (headers: string[], rows: string[][], opts: CsvMetaOptions = {}): string => {
  const lines: string[] = [];
  if (opts.title) lines.push(escapeCell(opts.title));
  if (opts.meta?.length) opts.meta.forEach((m) => lines.push(escapeCell(m)));
  if (opts.title || opts.meta?.length) lines.push('');
  lines.push(headers.map(escapeCell).join(','));
  rows.forEach((row) => lines.push(row.map((c) => escapeCell(c)).join(',')));
  return BOM + lines.join('\r\n') + '\r\n';
};

const fileStamp = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
};

const download = (csv: string, baseName: string): void => {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${baseName}_${fileStamp()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export function exportCSV(
  data: Record<string, unknown>[],
  filename: string,
  options: RecordsCsvOptions = {}
): void {
  if (!data.length) return;
  const columns = options.columns ?? Object.keys(data[0]);
  const headers = options.headers ?? columns.map(humanizeKey);
  const rows = data.map((record) => columns.map((col) => formatCell(record[col])));
  download(buildCsv(headers, rows, options), filename);
}

export function exportRowsCSV(
  headers: string[],
  rows: unknown[][],
  filename: string,
  options: CsvMetaOptions = {}
): void {
  download(buildCsv(headers, rows.map((row) => row.map(formatCell)), options), filename);
}
