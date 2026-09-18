import React from 'react';
import { Sun, Moon, Monitor, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useThemeStore, type ThemeMode } from '../../store/themeStore';
import { cn } from '../../lib/utils';

interface ModeOption {
  mode: ThemeMode;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  renderPreview: () => React.ReactNode;
}

export const ThemePreferenceSection: React.FC = () => {
  const { t } = useTranslation('common');
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  const modes: ModeOption[] = [
    {
      mode: 'light',
      label: t('theme.light', { defaultValue: 'Light' }),
      description: 'Clean, high-contrast daytime interface.',
      icon: Sun,
      renderPreview: () => (
        <div className="relative h-20 w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100 p-2 shadow-inner">
          <div className="flex h-full gap-1.5">
            {/* Miniature sidebar */}
            <div className="w-1/4 rounded bg-white p-1 space-y-1 border border-slate-200/80">
              <div className="h-1.5 w-full rounded-sm bg-primary/70" />
              <div className="h-1 w-3/4 rounded-sm bg-slate-200" />
              <div className="h-1 w-1/2 rounded-sm bg-slate-200" />
            </div>
            {/* Miniature content */}
            <div className="flex-1 space-y-1.5">
              <div className="h-3 rounded bg-white border border-slate-200/80 flex items-center px-1">
                <div className="h-1 w-8 rounded-sm bg-slate-300" />
              </div>
              <div className="grid grid-cols-2 gap-1">
                <div className="h-7 rounded bg-white border border-slate-200/80 p-1">
                  <div className="h-1 w-4 rounded-sm bg-primary" />
                </div>
                <div className="h-7 rounded bg-white border border-slate-200/80 p-1">
                  <div className="h-1 w-5 rounded-sm bg-amber-400" />
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      mode: 'dark',
      label: t('theme.dark', { defaultValue: 'Dark' }),
      description: 'Sleek, low-glare nighttime palette.',
      icon: Moon,
      renderPreview: () => (
        <div className="relative h-20 w-full overflow-hidden rounded-lg border border-slate-700 bg-slate-950 p-2 shadow-inner">
          <div className="flex h-full gap-1.5">
            {/* Miniature sidebar */}
            <div className="w-1/4 rounded bg-slate-900 p-1 space-y-1 border border-slate-800">
              <div className="h-1.5 w-full rounded-sm bg-primary" />
              <div className="h-1 w-3/4 rounded-sm bg-slate-700" />
              <div className="h-1 w-1/2 rounded-sm bg-slate-700" />
            </div>
            {/* Miniature content */}
            <div className="flex-1 space-y-1.5">
              <div className="h-3 rounded bg-slate-900 border border-slate-800 flex items-center px-1">
                <div className="h-1 w-8 rounded-sm bg-slate-600" />
              </div>
              <div className="grid grid-cols-2 gap-1">
                <div className="h-7 rounded bg-slate-900 border border-slate-800 p-1">
                  <div className="h-1 w-4 rounded-sm bg-primary" />
                </div>
                <div className="h-7 rounded bg-slate-900 border border-slate-800 p-1">
                  <div className="h-1 w-5 rounded-sm bg-amber-500" />
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      mode: 'system',
      label: t('theme.system', { defaultValue: 'System' }),
      description: 'Follows your operating system preference.',
      icon: Monitor,
      renderPreview: () => (
        <div className="relative h-20 w-full overflow-hidden rounded-lg border border-border/80 bg-slate-100 p-2 shadow-inner">
          {/* Diagonal split between light and dark */}
          <div className="flex h-full">
            {/* Left light half */}
            <div className="w-1/2 rounded-l bg-white p-1 border-y border-l border-slate-200 space-y-1">
              <div className="h-2 w-3/4 rounded-sm bg-primary/70" />
              <div className="h-1.5 w-1/2 rounded-sm bg-slate-200" />
              <div className="h-6 w-full rounded-sm bg-slate-100 border border-slate-200/60" />
            </div>
            {/* Right dark half */}
            <div className="w-1/2 rounded-r bg-slate-900 p-1 border-y border-r border-slate-800 space-y-1">
              <div className="h-2 w-3/4 rounded-sm bg-primary" />
              <div className="h-1.5 w-1/2 rounded-sm bg-slate-700" />
              <div className="h-6 w-full rounded-sm bg-slate-950 border border-slate-800" />
            </div>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-3 max-[419px]:grid-cols-1 gap-3.5">
      {modes.map(({ mode, label, description, icon: Icon, renderPreview }) => {
        const isActive = theme === mode;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => setTheme(mode)}
            aria-pressed={isActive}
            className={cn(
              'group relative flex flex-col justify-between rounded-2xl border-2 p-4 text-left transition-all duration-200',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              isActive
                ? 'border-primary bg-primary/[0.03] shadow-[0_0_0_1px_hsl(var(--primary))] ring-2 ring-primary/20'
                : 'border-border/60 bg-card hover:border-primary/40 hover:bg-secondary/40 hover:shadow-sm',
            )}
          >
            {/* UI Window Preview */}
            <div className="mb-3 w-full transition-transform duration-200 group-hover:scale-[1.02]">
              {renderPreview()}
            </div>

            {/* Label, Description & Status */}
            <div className="flex w-full items-start justify-between gap-2 pt-1 border-t border-border/40">
              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-1.5">
                  <Icon className={cn('h-4 w-4', isActive ? 'text-primary' : 'text-muted-foreground')} />
                  <span className="text-sm font-bold text-foreground">{label}</span>
                </div>
                <p className="text-[11px] leading-snug text-muted-foreground line-clamp-2">
                  {description}
                </p>
              </div>

              {isActive ? (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                  <Check className="h-3 w-3 stroke-[3]" />
                </span>
              ) : (
                <span className="h-5 w-5 shrink-0 rounded-full border border-border/80 group-hover:border-primary/50" />
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
};
