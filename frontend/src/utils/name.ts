/**
 * Human-name formatting helpers.
 *
 * Names are typed into staff forms the way people type — "abebe kebede" or
 * "ABEBE KEBEDE" — so every surface that shows a person's name runs it through
 * `formatPersonName` before rendering, and the staff forms store the formatted
 * version. That keeps the roster, payroll and attendance lists consistent
 * without touching the parts of a name that carry meaning (a lone lowercase
 * particle inside a word is left alone).
 */

/** Capitalises the first letter of a word, plus any letter after - or '. */
function capitalizeWord(word: string): string {
  return word.replace(/(^|[-'’])([a-z])/g, (_match, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** "abebe kebede" → "Abebe Kebede". Collapses stray whitespace. */
export function formatPersonName(name?: string | null): string {
  if (!name) return '';
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map(capitalizeWord)
    .join(' ');
}

/** Avatar letters — first name and last name initials, e.g. "Abebe Kebede" → "AK". */
export function nameInitials(name?: string | null): string {
  const parts = formatPersonName(name).split(' ').filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
