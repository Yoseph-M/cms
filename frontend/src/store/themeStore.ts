import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  initTheme: () => void;
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

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'light',
      setTheme: (theme) => {
        set({ theme });
        applyThemeClass(theme);
      },
      initTheme: () => {
        applyThemeClass(get().theme);
      },
    }),
    {
      name: 'cafeflow:theme',
    }
  )
);
