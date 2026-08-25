import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useThemeStore, type ThemeMode } from '../../store/themeStore';

export const ThemePreferenceSection: React.FC = () => {
  const { t } = useTranslation('common');
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  const modes: { mode: ThemeMode; label: string; icon: React.ReactNode }[] = [
    {
      mode: 'light',
      label: t('theme.light', { defaultValue: 'Light' }),
      icon: <Sun className="w-4 h-4" />,
    },
    {
      mode: 'dark',
      label: t('theme.dark', { defaultValue: 'Dark' }),
      icon: <Moon className="w-4 h-4" />,
    },
    {
      mode: 'system',
      label: t('theme.system', { defaultValue: 'System' }),
      icon: <Monitor className="w-4 h-4" />,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Sun className="w-4 h-4 text-primary" />
          {t('theme.label', { defaultValue: 'Appearance' })}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-4">
          {t('theme.description', {
            defaultValue:
              'Choose light or dark mode. "System" follows your device setting. Saved per device.',
          })}
        </p>
        <div className="flex gap-3">
          {modes.map(({ mode, label, icon }) => (
            <button
              key={mode}
              onClick={() => setTheme(mode)}
              aria-pressed={theme === mode}
              className={`px-4 py-2 rounded-lg text-sm font-medium border-2 transition-all flex items-center gap-2 ${
                theme === mode
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/40'
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
