import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: ThemeMode;
  /** Account id (or 'guest' on the login screen) whose sandbox is currently active. */
  scope: string;
  setTheme: (theme: ThemeMode) => void;
  initTheme: () => void;
  /** Point the theme sandbox at the signed-in account (null → guest/login scope). */
  syncScopeToUser: (userId?: string | null) => void;
}

const STORAGE_PREFIX = 'cafeflow:theme';
const GUEST_SCOPE = 'guest';
const DEFAULT_THEME: ThemeMode = 'light';

const isThemeMode = (value: unknown): value is ThemeMode =>
  value === 'light' || value === 'dark' || value === 'system';

const storageKeyFor = (scope: string) => `${STORAGE_PREFIX}:${scope}`;

/**
 * Which account's appearance sandbox are we in?
 *
 * Appearance is a per-account preference: a cashier flipping the terminal to
 * dark mode must not repaint the owner's or manager's workspace. The scope is
 * the cached user id so it is known before the first render; signed out we use
 * a shared guest scope for the login screen.
 */
function resolveScope(userId?: string | null): string {
  if (userId) return userId;
  try {
    const raw = localStorage.getItem('pos_user');
    if (!raw) return GUEST_SCOPE;
    const parsed = JSON.parse(raw);
    return typeof parsed?.id === 'string' && parsed.id ? parsed.id : GUEST_SCOPE;
  } catch {
    return GUEST_SCOPE;
  }
}

function readStoredTheme(scope: string): ThemeMode {
  try {
    const raw = localStorage.getItem(storageKeyFor(scope));
    if (!raw) return DEFAULT_THEME;
    const parsed = JSON.parse(raw);
    // Tolerate the legacy zustand payload shape ({ state: { theme } }).
    const value = parsed?.state?.theme ?? parsed;
    return isThemeMode(value) ? value : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function writeStoredTheme(scope: string, theme: ThemeMode) {
  try {
    localStorage.setItem(storageKeyFor(scope), JSON.stringify(theme));
  } catch {
    /* storage unavailable (private mode) — theme still applies in-session */
  }
}

// "System" is treated as the project's default light mode — it does NOT
// follow the OS `prefers-color-scheme`. Only the explicit "Dark" option
// switches to dark mode. This keeps the app visually consistent for users
// who pick System, regardless of their device setting.
const applyThemeClass = (mode: ThemeMode) => {
  if (typeof document === 'undefined') return;
  const isDark = mode === 'dark';
  document.documentElement.classList.toggle('dark', isDark);
};

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: DEFAULT_THEME,
  scope: GUEST_SCOPE,

  setTheme: (theme) => {
    const { scope } = get();
    set({ theme });
    writeStoredTheme(scope, theme);
    applyThemeClass(theme);
  },

  initTheme: () => {
    const scope = resolveScope();
    const theme = readStoredTheme(scope);
    set({ theme, scope });
    applyThemeClass(theme);
  },

  syncScopeToUser: (userId) => {
    const scope = resolveScope(userId);
    if (scope === get().scope) return;
    const theme = readStoredTheme(scope);
    set({ theme, scope });
    applyThemeClass(theme);
  },
}));
