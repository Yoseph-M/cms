import { describe, it, expect } from 'vitest';
import {
  displayItemName,
  englishHalf,
  findItemBySnapshot,
  hasEthiopic,
  indexItemsByName,
  isAmharicLanguage,
  labelForSnapshot,
  normalizeItemName,
  stripEnglishTail,
} from '../utils/itemName';

/**
 * Language-aware item labels.
 *
 * Order lines snapshot the catalogue name at sale time, so history can hold
 * several spellings of the same dish: an Amharic-only name from an older order,
 * a bilingual "ዶሮ ወጥ (Doro Wat)", and today's English one. The catalogue is the
 * only place that knows both languages, which is why these helpers exist — every
 * list of item names goes through them instead of printing the snapshot.
 */

const DORO = { id: 'm1', name: 'Doro Wat', nameAmharic: 'ዶሮ ወጥ' };
const SWAPPED = { id: 'm2', name: 'የበሬ ጥብስ', nameAmharic: 'Beef Tibs' };

describe('item name helpers', () => {
  it('reads the language off the active locale', () => {
    expect(isAmharicLanguage('am')).toBe(true);
    expect(isAmharicLanguage('am-ET')).toBe(true);
    expect(isAmharicLanguage('EN')).toBe(false);
    expect(isAmharicLanguage(undefined)).toBe(false);
  });

  it('splits a bilingual snapshot without touching an English parenthetical', () => {
    expect(englishHalf('ዶሮ ወጥ (Doro Wat)')).toBe('Doro Wat');
    expect(englishHalf('Doro Wat')).toBeNull();
    // "Beef (spicy)" is not bilingual — the tail is a note, not a translation.
    expect(englishHalf('Beef (spicy)')).toBeNull();
    expect(stripEnglishTail('ዶሮ ወጥ (Doro Wat)')).toBe('ዶሮ ወጥ');
    expect(stripEnglishTail('Doro Wat')).toBe('Doro Wat');
    expect(hasEthiopic('ዶሮ ወጥ')).toBe(true);
  });

  it('normalises a snapshot key: case, the bilingual tail and stray spacing', () => {
    expect(normalizeItemName('  Beef   Tibs ')).toBe('beef tibs');
    expect(normalizeItemName('ዶሮ ወጥ (Doro Wat)')).toBe('ዶሮ ወጥ');
  });

  it('labels an explicit name pair for the active language', () => {
    expect(displayItemName(DORO.name, DORO.nameAmharic, false)).toBe('Doro Wat');
    expect(displayItemName(DORO.name, DORO.nameAmharic, true)).toBe('ዶሮ ወጥ');
    expect(displayItemName('ዶሮ ወጥ (Doro Wat)', null, false)).toBe('Doro Wat');
    expect(displayItemName('ዶሮ ወጥ (Doro Wat)', null, true)).toBe('ዶሮ ወጥ');
  });

  it('resolves a snapshot back to its catalogue row by either name', () => {
    const index = indexItemsByName([DORO, SWAPPED]);
    expect(findItemBySnapshot(index, 'Doro Wat')).toBe(DORO);
    expect(findItemBySnapshot(index, 'ዶሮ ወጥ')).toBe(DORO);
    expect(findItemBySnapshot(index, 'ዶሮ ወጥ (Doro Wat)')).toBe(DORO);
    expect(findItemBySnapshot(index, 'Beef Tibs')).toBe(SWAPPED);
    expect(findItemBySnapshot(index, 'Uncle Dick\'s Jerky')).toBeNull();

    // A catalogue name that drifted from the snapshot still folds: the English
    // half is tried too, not just the whole string.
    const renamed = indexItemsByName([{ id: 'm3', name: 'Doro Wot', nameAmharic: 'ዶሮ ውጥ' }]);
    expect(findItemBySnapshot(renamed, 'ዶሮ ወጥ (Doro Wot)')).toMatchObject({ id: 'm3' });
  });

  it('translates a legacy Amharic snapshot with the catalogue English name', () => {
    expect(labelForSnapshot('ዶሮ ወጥ', DORO, false)).toBe('Doro Wat');
  });

  it('uses the snapshot English half when the item left the catalogue', () => {
    expect(labelForSnapshot('ዶሮ ወጥ (Doro Wat)', null, false)).toBe('Doro Wat');
  });

  it('accepts a Latin name in either catalogue field, and never invents one', () => {
    // Some rows have the two names the other way round; the English reader still
    // gets Latin text rather than the Amharic `name`.
    expect(labelForSnapshot('የበሬ ጥብስ', SWAPPED, false)).toBe('Beef Tibs');
    // Nothing Latin exists anywhere: the snapshot is shown as-is rather than
    // silently dropping a real item.
    expect(labelForSnapshot('ዶሮ ወጥ', null, false)).toBe('ዶሮ ወጥ');
  });

  it('labels an Amharic reader in Amharic, including from an English snapshot', () => {
    expect(labelForSnapshot('Doro Wat', DORO, true)).toBe('ዶሮ ወጥ');
    expect(labelForSnapshot('Doro Wat (spicy)', null, true)).toBe('Doro Wat (spicy)');
  });
});
