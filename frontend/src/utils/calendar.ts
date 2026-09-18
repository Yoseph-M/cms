/**
 * Date formatting helpers.
 *
 * The system uses the Gregorian calendar exclusively.
 */

/** Format a Date according to the app's display conventions. */
export function formatDate(
  input: Date | string | number,
  opts: { includeWeekday?: boolean } = {}
): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(opts.includeWeekday ? { weekday: 'short' as const } : {}),
  });
}

/** Format a YYYY-MM-DD business date string. */
export function formatBusinessDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return formatDate(new Date(y, m - 1, d, 12, 0, 0));
}
