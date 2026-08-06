/**
 * Gregorian ↔ Ethiopian calendar conversion and display helpers.
 *
 * Ethiopian calendar: 12 months of 30 days + Pagumen (5 or 6 days).
 * Eth year ≈ Greg year − 7/8 depending on date.
 *
 * Preference is stored in localStorage under `cafeflow.calendar`.
 */

export type CalendarSystem = 'gregorian' | 'ethiopian';

const STORAGE_KEY = 'cafeflow.calendar';

export function getCalendarPreference(): CalendarSystem {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'ethiopian' || v === 'gregorian') return v;
  } catch {
    /* ignore */
  }
  return 'gregorian';
}

export function setCalendarPreference(system: CalendarSystem): void {
  try {
    localStorage.setItem(STORAGE_KEY, system);
    window.dispatchEvent(new CustomEvent('cafeflow:calendar-changed', { detail: system }));
  } catch {
    /* ignore */
  }
}

export interface EthDate {
  year: number;
  month: number; // 1–13 (13 = Pagumen)
  day: number;
}

/** Convert Gregorian Date → Ethiopian Y/M/D */
export function toEthiopian(date: Date): EthDate {
  // Algorithm adapted from common JS Eth calendar conversions
  const jdn = gregorianToJdn(date.getFullYear(), date.getMonth() + 1, date.getDate());
  return jdnToEthiopian(jdn);
}

/** Convert Ethiopian Y/M/D → Gregorian Date (local noon to avoid DST edge) */
export function fromEthiopian(eth: EthDate): Date {
  const jdn = ethiopianToJdn(eth.year, eth.month, eth.day);
  const g = jdnToGregorian(jdn);
  return new Date(g.year, g.month - 1, g.day, 12, 0, 0);
}

const ETH_MONTHS = [
  'Meskerem',
  'Tikimt',
  'Hidar',
  'Tahsas',
  'Tir',
  'Yekatit',
  'Megabit',
  'Miazia',
  'Ginbot',
  'Sene',
  'Hamle',
  'Nehasse',
  'Pagumen',
];

export function ethMonthName(month: number): string {
  return ETH_MONTHS[month - 1] || String(month);
}

/** Format a Date according to user calendar preference. */
export function formatDate(
  input: Date | string | number,
  opts: { includeWeekday?: boolean; calendar?: CalendarSystem } = {}
): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '—';

  const cal = opts.calendar ?? getCalendarPreference();

  if (cal === 'ethiopian') {
    const e = toEthiopian(date);
    const base = `${ethMonthName(e.month)} ${e.day}, ${e.year} EC`;
    if (opts.includeWeekday) {
      const wd = date.toLocaleDateString('en-US', { weekday: 'short' });
      return `${wd}, ${base}`;
    }
    return base;
  }

  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(opts.includeWeekday ? { weekday: 'short' as const } : {}),
  });
}

/** Format a YYYY-MM-DD business date string. */
export function formatBusinessDate(ymd: string, calendar?: CalendarSystem): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return formatDate(new Date(y, m - 1, d, 12, 0, 0), { calendar });
}

// --- Julian Day Number helpers ---

function gregorianToJdn(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

function jdnToGregorian(jdn: number): { year: number; month: number; day: number } {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  const day = e - Math.floor((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * Math.floor(m / 10);
  const year = 100 * b + d - 4800 + Math.floor(m / 10);
  return { year, month, day };
}

function ethiopianToJdn(year: number, month: number, day: number): number {
  return (
    EthEpochOffset +
    365 * (year - 1) +
    Math.floor(year / 4) +
    30 * (month - 1) +
    day -
    1
  );
}

function jdnToEthiopian(jdn: number): EthDate {
  const r = jdn - EthEpochOffset;
  const year = Math.floor((4 * r + 1463) / 1461);
  const t = r - 365 * (year - 1) - Math.floor(year / 4);
  const month = Math.floor(t / 30) + 1;
  const day = (t % 30) + 1;
  return { year, month, day };
}

/** JDN of Meskerem 1, 1 EC ≈ Sep 11, 8 AD (Julian) / commonly used offset 1723856 */
const EthEpochOffset = 1723856;
