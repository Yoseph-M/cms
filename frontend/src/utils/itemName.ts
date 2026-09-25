/**
 * Language-aware menu item labelling.
 *
 * Item names reach a screen from two places. Order lines snapshot the catalogue
 * `name` at sale time (a rename never rewrites history), while the menu API
 * ships both the main `name` and the Amharic `nameAmharic`. A widget that simply
 * prints the snapshot therefore mixes languages: legacy snapshots are Amharic
 * while newer ones are English, a bilingual snapshot ("የበሬ ጥብስ (Beef Tibs)")
 * shows both at once, and the same dish can even be listed twice — once per
 * snapshot language — with its sales split between the two rows.
 *
 * These helpers resolve a snapshot back to its catalogue row and pick the label
 * the active UI language expects, so every list of item names reads in one
 * language.
 */

/** Ethiopic script block — tells an Amharic label apart from a Latin one. */
const ETHIOPIC_RE = /[\u1200-\u137F]/;

export interface ItemNameRow {
  id?: string;
  name?: string | null;
  nameAmharic?: string | null;
}

/** True when a language code belongs to the Amharic UI. */
export function isAmharicLanguage(language: string | null | undefined): boolean {
  return (language ?? '').toLowerCase().startsWith('am');
}

export function hasEthiopic(text: string): boolean {
  return ETHIOPIC_RE.test(text);
}

/** A snapshot key that ignores case, the bilingual tail and extra spacing. */
export function normalizeItemName(name: string): string {
  return String(name ?? '')
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The English half of a bilingual snapshot — "የበሬ ጥብስ (Beef Tibs)" → "Beef Tibs".
 * Only used when the name really is bilingual: an English-only name with a
 * parenthetical like "Beef (spicy)" is left untouched.
 */
export function englishHalf(name: string): string | null {
  const raw = String(name ?? '');
  if (!hasEthiopic(raw)) return null;
  const match = raw.match(/\(([^)]+)\)\s*$/);
  const inner = match?.[1]?.trim();
  return inner && !hasEthiopic(inner) ? inner : null;
}

/**
 * Drops a trailing translated tail, leaving the Amharic label.
 *
 * The tail is only dropped when the head really is Amharic and the tail is not,
 * so an English name with a note — "Doro Wat (spicy)" — keeps its note.
 */
export function stripEnglishTail(name: string): string {
  const raw = String(name ?? '').trim();
  const match = raw.match(/\(([^)]+)\)\s*$/);
  if (!match || hasEthiopic(match[1])) return raw;
  const head = raw.slice(0, match.index).trim();
  return head && hasEthiopic(head) ? head : raw;
}

/**
 * Label for an explicit pair of names (catalogue row, or a snapshot plus the
 * catalogue's Amharic field), in the language the user is reading.
 */
export function displayItemName(
  name: string | null | undefined,
  nameAmharic: string | null | undefined,
  preferAmharic: boolean,
): string {
  const english = String(name ?? '').trim();
  const amharic = String(nameAmharic ?? '').trim();
  if (preferAmharic) return amharic || stripEnglishTail(english) || english;
  return englishHalf(english) ?? english;
}

/**
 * Catalogue rows indexed by BOTH of their names (and the normalised forms), so
 * an order-line snapshot written in either language resolves back to the item.
 */
export function indexItemsByName<T extends ItemNameRow>(rows: readonly T[] | undefined): Map<string, T> {
  const index = new Map<string, T>();
  for (const row of rows ?? []) {
    for (const candidate of [row?.name, row?.nameAmharic]) {
      const label = String(candidate ?? '').trim();
      if (label) index.set(label, row);
      const normalized = normalizeItemName(label);
      if (normalized) index.set(normalized, row);
    }
  }
  return index;
}

/** Catalogue row behind an order-line snapshot, matched on either language. */
export function findItemBySnapshot<T>(
  index: Map<string, T>,
  snapshot: string,
): T | null {
  const raw = String(snapshot ?? '').trim();
  if (!raw) return null;
  // Both halves of a bilingual snapshot are tried, so a slightly edited
  // catalogue name on either side still folds onto the same row.
  for (const candidate of [raw, normalizeItemName(raw), stripEnglishTail(raw), englishHalf(raw)]) {
    const label = String(candidate ?? '').trim();
    if (!label) continue;
    const hit = index.get(label) ?? index.get(normalizeItemName(label));
    if (hit) return hit;
  }
  return null;
}

/**
 * The label an order-line snapshot should carry in the active language.
 *
 * The catalogue wins when it holds a name in the requested script, because a
 * snapshot can be stale (renames) or written in the other language entirely.
 * Only when the catalogue has no such text does the snapshot speak — its
 * bilingual tail for English, its Amharic head for Amharic.
 */
export function labelForSnapshot(
  snapshot: string,
  row: ItemNameRow | null | undefined,
  preferAmharic: boolean,
): string {
  const raw = String(snapshot ?? '').trim();
  const catalogueName = String(row?.name ?? '').trim();
  const catalogueAmharic = String(row?.nameAmharic ?? '').trim();

  if (preferAmharic) {
    return (
      (hasEthiopic(catalogueAmharic) ? catalogueAmharic : '') ||
      (hasEthiopic(catalogueName) ? catalogueName : '') ||
      stripEnglishTail(raw) ||
      raw
    );
  }

  return (
    (!hasEthiopic(catalogueName) && catalogueName ? catalogueName : '') ||
    (!hasEthiopic(catalogueAmharic) && catalogueAmharic ? catalogueAmharic : '') ||
    englishHalf(raw) ||
    raw
  );
}
