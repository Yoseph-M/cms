import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  ShieldCheck,
} from 'lucide-react';
import { SettingsShell, type SettingsShellCategory } from '../../components/settings/SettingsShell';
import { useHeaderStore } from '../../store/headerStore';

import { ThemePreferenceSection } from '../../components/settings/ThemePreferenceSection';
import { LanguagePreferenceSection } from '../../components/settings/LanguagePreferenceSection';
import { NotificationPreferencesSection } from '../../components/settings/NotificationPreferencesSection';
import { OwnerAttendanceToggle } from '../../components/settings/OwnerAttendanceToggle';
import { WorkOnSundaysToggle } from '../../components/settings/WorkOnSundaysToggle';
import { OwnerMenuEditToggle } from '../../components/settings/OwnerMenuEditToggle';
import { FeatureToggles } from '../../components/settings/FeatureToggles';

export const OwnerSettings: React.FC = () => {
  const { t } = useTranslation('owner');
  const { setPageTitle, setShowDateRange } = useHeaderStore();

  React.useEffect(() => {
    setPageTitle({
      title: t('settings.title', { defaultValue: 'System Settings' }),
      subtitle: t('settings.subtitle', {
        defaultValue: 'Configure your business identity, terminal preferences, and role permissions.',
      }),
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
      description: 'Theme appearance, language, and notification channels',
      items: [
        {
          id: 'appearance',
          title: 'Visual Theme',
          description: 'Switch between light, dark, or system-synchronized appearance.',
          keywords: ['theme', 'dark mode', 'light mode', 'system', 'appearance', 'palette'],
          content: <ThemePreferenceSection />,
        },
        {
          id: 'language',
          title: 'Language & Locale',
          description: 'Select your preferred language. Syncs across all devices tied to your account.',
          keywords: ['language', 'english', 'amharic', 'አማርኛ', 'locale', 'translate'],
          content: <LanguagePreferenceSection />,
        },
        {
          id: 'notifications',
          title: 'Notification Alert Channels',
          description: 'Control which system events trigger notifications on this terminal.',
          keywords: ['notifications', 'alerts', 'printer', 'attendance', 'payroll', 'bell', 'sound'],
          content: <NotificationPreferencesSection />,
        },
      ],
    },
    {
      id: 'access',
      label: 'Access & Permissions',
      description: 'Who can edit the menu, override attendance, and reach optional system modules',
      icon: ShieldCheck,
      iconClassName: 'text-emerald-600 dark:text-emerald-400',
      iconBgClassName: 'bg-emerald-500/10',
      items: [
        {
          id: 'menu-editing',
          title: 'Menu Editing',
          description: 'Menu editing is an opt-in for owners and managers — off by default.',
          keywords: ['menu', 'edit', 'catalog', 'items', 'owner', 'manager', 'read only'],
          content: <OwnerMenuEditToggle />,
        },
        {
          id: 'attendance-schedule',
          title: 'Attendance & Operating Schedule',
          description: 'Historical attendance editing privileges and Sunday operating rules.',
          keywords: ['attendance', 'sunday', 'schedule', 'shift', 'work days', 'owner correction'],
          content: (
            <div className="space-y-4">
              <OwnerAttendanceToggle />
              <div className="border-t border-border/50 pt-4">
                <WorkOnSundaysToggle />
              </div>
            </div>
          ),
        },
        {
          id: 'feature-toggles',
          title: 'System Feature Management',
          description:
            'Control access to optional modules. Disabling the Manager Dashboard moves its tools into your own workspace — you take over every manager capability.',
          keywords: ['features', 'toggles', 'manager dashboard', 'system admin', 'consolidate'],
          content: <FeatureToggles />,
        },
      ],
    },
  ];

  return (
    <SettingsShell
      title={t('settings.title', { defaultValue: 'System Settings' })}
      description={t('settings.subtitle', {
        defaultValue: 'Configure your business identity, terminal preferences, and role permissions.',
      })}
      categories={categories}
    />
  );
};
