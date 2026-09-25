import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Locale coverage guard.
 *
 * A missing translation is silent in every other test: i18next hands back the
 * key itself, so the UI renders things like "table.status" or
 * "cashier.queue.table" instead of copy — which is exactly how the staff page
 * once shipped with an entire missing namespace. This suite statically resolves
 * every `t('…')` / `i18n.t('…')` literal in the app against the shipped
 * catalogues and fails when a key would show up raw.
 *
 * Rules the resolver honours, mirroring i18next's own lookup:
 *   • the namespaces the file declares (`useTranslation('staff')`,
 *     arrays too) — otherwise the default `common`;
 *   • a per-call namespace (`{ ns: 'owner' }`) or the qualified `ns:key` form;
 *   • plural forms (`_one`/`_other`) when the call passes `count`.
 *
 * A call that carries its own `defaultValue` is not a raw-key risk (i18next
 * renders the default), so it is exempt from the hard failure.
 */

const SRC = path.resolve(process.cwd(), 'src');
const LANGUAGES = ['en', 'am'] as const;

/** Bundles the app ships — derived from disk so a new one is never forgotten. */
const NAMESPACES = fs
  .readdirSync(path.join(SRC, 'locales', 'en'))
  .filter((file) => file.endsWith('.json'))
  .map((file) => file.replace(/\.json$/, ''));

type Bundle = Record<string, unknown>;

const CATALOGS: Record<string, Record<string, Bundle>> = { en: {}, am: {} };
for (const lng of LANGUAGES) {
  for (const ns of NAMESPACES) {
    const file = path.join(SRC, 'locales', lng, `${ns}.json`);
    CATALOGS[lng][ns] = JSON.parse(fs.readFileSync(file, 'utf8')) as Bundle;
  }
}

function listSourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(full);
    if (!/\.(ts|tsx)$/.test(entry.name)) return [];
    if (entry.name.includes('.test.')) return [];
    return [full];
  });
}

/** Dotted lookup, accepting the plural suffixes when the call passes `count`. */
function lookup(bundle: Bundle | undefined, key: string, plural: boolean): boolean {
  const candidates = plural ? [`${key}_one`, `${key}_other`, `${key}_plural`, key] : [key];
  return candidates.some((candidate) => {
    let current: unknown = bundle;
    for (const part of candidate.split('.')) {
      if (typeof current !== 'object' || current === null || !(part in current)) return false;
      current = (current as Record<string, unknown>)[part];
    }
    return true;
  });
}

interface TranslationCall {
  file: string;
  key: string;
  namespaces: string[];
  plural: boolean;
  hasDefaultValue: boolean;
}

/** The balanced `( … )` argument list starting right after the key literal. */
function optionsText(source: string, from: number): string {
  let depth = 1;
  let i = from;
  while (i < source.length && depth > 0) {
    if (source[i] === '(') depth += 1;
    else if (source[i] === ')') depth -= 1;
    i += 1;
  }
  return source.slice(from, i);
}

function callsIn(file: string, source: string): TranslationCall[] {
  // Namespaces this module declares. A module with none talks to the default
  // bundle (`common`) — `i18n.t(...)` in a hook does the same.
  const declared = [...source.matchAll(/useTranslation\(\s*\[?([^)\]]*)/g)].map((m) => m[1]).join(' ');
  const declaredNamespaces = [...declared.matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]);
  const fallbackNamespaces = declaredNamespaces.length ? declaredNamespaces : ['common'];

  const calls: TranslationCall[] = [];
  for (const match of source.matchAll(/\bt\(\s*'([A-Za-z][\w.:]*)'/g)) {
    const [, rawKey] = match;
    const options = optionsText(source, match.index + match[0].length);

    let key = rawKey;
    let explicitNamespace: string | undefined;
    const qualified = rawKey.match(/^([A-Za-z]+):(.+)$/);
    if (qualified) {
      explicitNamespace = qualified[1];
      key = qualified[2];
    }
    const nsOption = options.match(/ns:\s*'([A-Za-z]+)'/);
    if (nsOption) explicitNamespace = nsOption[1];

    calls.push({
      file: path.relative(process.cwd(), file),
      key,
      namespaces: explicitNamespace ? [explicitNamespace] : fallbackNamespaces,
      plural: /\bcount\b/.test(options),
      hasDefaultValue: options.includes('defaultValue'),
    });
  }
  return calls;
}

const ALL_CALLS = listSourceFiles(SRC).flatMap((file) =>
  callsIn(file, fs.readFileSync(file, 'utf8')),
);

const resolvesIn = (lng: string, call: TranslationCall) =>
  call.namespaces.some((ns) => lookup(CATALOGS[lng][ns], call.key, call.plural));

describe('locale coverage', () => {
  it('scans the whole app, not just a corner of it', () => {
    // Guards against the scanner silently matching nothing after a refactor.
    expect(ALL_CALLS.length).toBeGreaterThan(300);
  });

  it('never renders a raw i18n key', () => {
    const raw = ALL_CALLS.filter((call) => !call.hasDefaultValue && !resolvesIn('en', call)).map(
      (call) => `${call.file}: ${call.key} [${call.namespaces.join(', ')}]`,
    );
    expect(raw).toEqual([]);
  });

  it('has Amharic copy for every key the UI shows', () => {
    const missing = ALL_CALLS.filter(
      (call) => !call.hasDefaultValue && resolvesIn('en', call) && !resolvesIn('am', call),
    ).map((call) => `${call.file}: ${call.key} [${call.namespaces.join(', ')}]`);
    expect(missing).toEqual([]);
  });
});
