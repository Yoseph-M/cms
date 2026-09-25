import React from 'react';
import { useTranslation } from 'react-i18next';
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
      description={t('settings.cashierDescription')}
      categories={categories}
    />
  );
};
