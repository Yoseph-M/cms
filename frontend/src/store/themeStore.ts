import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  initTheme: () => void;
}

const applyThemeClass = (mode: ThemeMode) => {
  if (typeof document === 'undefined') return;
  const prefersDark =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const isDark = mode === 'dark' || (mode === 'system' && prefersDark);
  document.documentElement.classList.toggle('dark', isDark);
};

let systemListenerBound = false;

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      setTheme: (theme) => {
        set({ theme });
        applyThemeClass(theme);
      },
      initTheme: () => {
        applyThemeClass(get().theme);
        if (!systemListenerBound && typeof window !== 'undefined' && window.matchMedia) {
          window
            .matchMedia('(prefers-color-scheme: dark)')
            .addEventListener('change', () => applyThemeClass(get().theme));
          systemListenerBound = true;
        }
      },
    }),
    {
      name: 'cafeflow:theme',
    }
  )
);
