/**
 * Date formatting helpers.
 *
 * The system uses the Gregorian calendar exclusively. Month and weekday names
 * follow the active UI language (Amharic names render in Amharic; everything
 * else falls back to the English names).
 */

/** Resolves to the active UI language, e.g. `am` / `en-GB`. */
function uiLocale(): string {
  // Imported lazily to keep this module usable outside React as well.
  // i18next is always initialised before any component renders.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const lng = (globalThis as { __APP_LANG__?: string }).__APP_LANG__;
  return lng === 'am' ? 'am' : 'en-GB';
}

/** Format a Date according to the app's display conventions. */
export function formatDate(
  input: Date | string | number,
  opts: { includeWeekday?: boolean } = {}
): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleDateString(uiLocale(), {
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
