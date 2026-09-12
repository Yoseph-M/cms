import React from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Monitor } from 'lucide-react';
import { SettingsShell, type SettingsShellCategory } from '../../components/settings/SettingsShell';
import { NotificationPreferencesSection } from '../../components/settings/NotificationPreferencesSection';
import { LanguagePreferenceSection } from '../../components/settings/LanguagePreferenceSection';
import { ThemePreferenceSection } from '../../components/settings/ThemePreferenceSection';
import { useHeaderStore } from '../../store/headerStore';

export const CashierSettings: React.FC = () => {
  const { t } = useTranslation('owner');
  const { setPageTitle, setShowDateRange } = useHeaderStore();

  React.useEffect(() => {
    setPageTitle({
      title: t('settings.title', { defaultValue: 'Settings' }),
      subtitle: 'Personalize appearance, notifications, and language for this terminal.',
    });
    setShowDateRange(false);
    return () => {
      setPageTitle({ title: 'Overview', subtitle: '' });
      setShowDateRange(false);
    };
  }, [setPageTitle, setShowDateRange, t]);

  const categories: SettingsShellCategory[] = [
    {
      id: 'preferences',
      label: 'Terminal Preferences',
      description: 'Display theme, language, and notification channels for this device',
      icon: Sparkles,
      iconClassName: 'text-sky-600 dark:text-sky-400',
      iconBgClassName: 'bg-sky-500/10',
      items: [
        {
          id: 'appearance',
          title: 'Visual Theme',
          description: 'Switch between light, dark, or system-synchronized appearance.',
          keywords: ['theme', 'dark mode', 'light mode', 'system', 'appearance'],
          content: <ThemePreferenceSection />,
        },
        {
          id: 'language',
          title: 'Language & Locale',
          description: 'Choose between English and Amharic for your personal account.',
          keywords: ['language', 'english', 'amharic', 'አማርኛ', 'locale', 'translate'],
          content: <LanguagePreferenceSection />,
        },
        {
          id: 'notifications',
          title: 'Notification Channels',
          description: 'Configure which operational alerts reach your notification bell.',
          keywords: ['notifications', 'alerts', 'printer', 'bell', 'sound'],
          content: <NotificationPreferencesSection />,
        },
      ],
    },
  ];

  return (
    <SettingsShell
      title={t('settings.title', { defaultValue: 'Terminal Settings' })}
      description="Personalize appearance, notifications, and language for this terminal."
      badge={
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/10 px-2.5 py-0.5 text-xs font-semibold text-sky-700 dark:text-sky-300 ring-1 ring-inset ring-sky-500/20">
          <Monitor className="h-3.5 w-3.5" />
          Front-of-house
        </span>
      }
      categories={categories}
    />
  );
};
