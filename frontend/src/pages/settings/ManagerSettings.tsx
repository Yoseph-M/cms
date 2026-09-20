import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';
import { SettingsShell, type SettingsShellCategory } from '../../components/settings/SettingsShell';
import { NotificationPreferencesSection } from '../../components/settings/NotificationPreferencesSection';
import { ManagerMenuEditToggle } from '../../components/settings/ManagerMenuEditToggle';
import { TableCountSetting } from '../../components/settings/TableCountSetting';
import { WorkOnSundaysToggle } from '../../components/settings/WorkOnSundaysToggle';
import { LanguagePreferenceSection } from '../../components/settings/LanguagePreferenceSection';
import { ThemePreferenceSection } from '../../components/settings/ThemePreferenceSection';
import { useHeaderStore } from '../../store/headerStore';

export const ManagerSettings: React.FC = () => {
  const { t } = useTranslation('owner');
  const { setPageTitle, setShowDateRange } = useHeaderStore();

  useEffect(() => {
    setPageTitle({
      title: t('settings.title', { defaultValue: 'Settings' }),
      subtitle: 'Manage terminal preferences and operational rules shared with Owners.',
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
      label: 'Preferences',
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
          keywords: ['notifications', 'alerts', 'sound', 'printer', 'attendance', 'payroll'],
          content: <NotificationPreferencesSection />,
        },
      ],
    },
    {
      id: 'access',
      label: 'Operations & Access',
      description: 'Menu editing, dining room tables, and schedule settings',
      icon: ShieldCheck,
      iconClassName: 'text-emerald-600 dark:text-emerald-400',
      iconBgClassName: 'bg-emerald-500/10',
      items: [
        {
          id: 'menu-editing',
          title: 'Menu Editing',
          description: 'Control who can add, edit, and hide menu items.',
          keywords: ['menu', 'edit', 'catalog', 'items', 'owner', 'manager'],
          content: (
            <div className="space-y-4">
              {/* Managers only get their own switch. The owner's menu-editing
                  permission is the owner's setting, not one a manager flips. */}
              <ManagerMenuEditToggle />
              <div className="border-t border-border/50 pt-4">
                <TableCountSetting />
              </div>
            </div>
          ),
        },
        {
          id: 'attendance',
          title: 'Operating Schedule',
          description: 'Configure whether Sundays are treated as working days.',
          keywords: ['attendance', 'sunday', 'schedule', 'shift', 'work days'],
          content: <WorkOnSundaysToggle />,
        },
      ],
    },
  ];

  return (
    <SettingsShell
      title={t('settings.title', { defaultValue: 'Manager Settings' })}
      description="Manage terminal preferences and operational rules shared with Owners."
      categories={categories}
    />
  );
};
