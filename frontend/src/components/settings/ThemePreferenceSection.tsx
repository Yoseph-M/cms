import React from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useThemeStore, type ThemeMode } from '../../store/themeStore';
import { cn } from '../../lib/utils';

interface ModeOption {
  mode: ThemeMode;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const ThemePreferenceSection: React.FC = () => {
  const { t } = useTranslation('common');
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  const modes: ModeOption[] = [
    {
      mode: 'light',
      label: t('theme.light', { defaultValue: 'Light' }),
      description: 'Bright, daytime look.',
      icon: Sun,
    },
    {
      mode: 'dark',
      label: t('theme.dark', { defaultValue: 'Dark' }),
      description: 'Easier on the eyes at night.',
      icon: Moon,
    },
    {
      mode: 'system',
      label: t('theme.system', { defaultValue: 'System' }),
      description: "App's default light mode.",
      icon: Monitor,
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {modes.map(({ mode, label, description, icon: Icon }) => {
        const isActive = theme === mode;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => setTheme(mode)}
            aria-pressed={isActive}
            className={cn(
              'group relative flex flex-col items-start gap-2 rounded-xl border-2 p-4 text-left transition-all',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
              isActive
                ? 'border-primary bg-primary/5 shadow-[0_0_0_4px_hsl(var(--primary)/0.10)]'
                : 'border-border/60 hover:border-primary/40 hover:bg-secondary/50',
            )}
          >
            <div className="flex w-full items-center justify-between">
              <span
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-lg ring-1 ring-inset ring-black/[0.04] dark:ring-white/[0.06]',
                  isActive ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              {isActive && (
                <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
                  Active
                </span>
              )}
            </div>
            <div className="space-y-0.5">
              <div className="text-sm font-semibold text-foreground">{label}</div>
              <div className="text-xs text-muted-foreground">{description}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
};
