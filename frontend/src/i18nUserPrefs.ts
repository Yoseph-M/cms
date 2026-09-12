import i18n from './i18n';
import type { User } from './types';

/**
 * Per-user UI language lifecycle.
 *
 * The app supports per-account language preferences, so the UI language must
 * belong to the signed-in USER — not to the browser/device. Two rules keep
 * different accounts from leaking their language into each other:
 *
 *  1. APPLY — when a session becomes known (login, silent refresh, hard
 *     reload), switch i18n to that user's `preferredLanguage`.
 *  2. RESET — when the session ends (logout), return to a NEUTRAL language
 *     derived from the device instead of keeping the previous account's
 *     preference. Otherwise the login screen — and the next user's whole
 *     session — would start in the previous user's language.
 *
 * `applyUserLanguage` is idempotent and safe to call on every session event;
 * it no-ops when the requested language is already active. Both functions
 * return a promise that resolves once the language switch (if any) settles.
 */

const SUPPORTED_LANGUAGES = ['en', 'am'] as const;

const isSupportedLanguage = (lng: string): lng is (typeof SUPPORTED_LANGUAGES)[number] =>
  (SUPPORTED_LANGUAGES as readonly string[]).includes(lng);

/** Language the signed-in user prefers, or null when they have none. */
export const preferredLanguageOf = (user: Pick<User, 'preferredLanguage'> | null | undefined): string | null => {
  const lng = user?.preferredLanguage;
  return lng && isSupportedLanguage(lng) ? lng : null;
};

/**
 * Language to show when NO user is signed in (login screen, post-logout):
 * the device/browser language when supported, otherwise the app fallback.
 */
export const neutralLanguage = (): string => {
  const candidates = typeof navigator !== 'undefined' ? navigator.languages || [navigator.language] : [];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const base = candidate.toLowerCase().split(/[-_]/)[0];
    if (isSupportedLanguage(base)) return base;
  }
  return i18n.options.fallbackLng && typeof i18n.options.fallbackLng === 'string'
    ? i18n.options.fallbackLng
    : 'en';
};

/** Switch i18n to the given language if it is not already active. */
export const changeLanguageIfDifferent = async (lng: string): Promise<void> => {
  if (i18n.language === lng) return;
  await i18n.changeLanguage(lng);
};

/** Apply the signed-in user's preferred language (no-op when it matches). */
export const applyUserLanguage = async (
  user: Pick<User, 'preferredLanguage'> | null | undefined,
): Promise<void> => {
  const lng = preferredLanguageOf(user);
  // No preference stored (or invalid): fall back to the device language so a
  // fresh account never inherits a previous user's choice.
  await changeLanguageIfDifferent(lng ?? neutralLanguage());
};

/** Reset to the neutral device language after sign-out. */
export const resetToNeutralLanguage = async (): Promise<void> => {
  await changeLanguageIfDifferent(neutralLanguage());
};
