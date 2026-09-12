import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, ShieldCheck } from 'lucide-react';
import { SettingsShell, type SettingsShellCategory } from '../../components/settings/SettingsShell';
import { NotificationPreferencesSection } from '../../components/settings/NotificationPreferencesSection';
import { CashierOrderingToggle } from '../../components/settings/CashierOrderingToggle';
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
      icon: Sparkles,
      iconClassName: 'text-violet-600 dark:text-violet-400',
      iconBgClassName: 'bg-violet-500/10',
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
      description: 'Dining room tables, cashier ordering, and schedule settings',
      icon: ShieldCheck,
      iconClassName: 'text-emerald-600 dark:text-emerald-400',
      iconBgClassName: 'bg-emerald-500/10',
      items: [
        {
          id: 'ordering-tables',
          title: 'Cashier Ordering & Dining Tables',
          description: 'Control cashier checkout permissions and dining room table allocation.',
          keywords: ['ordering', 'cashier', 'tables', 'pos', 'capacity'],
          content: (
            <div className="space-y-4">
              <CashierOrderingToggle />
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
      badge={
        <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-500/10 px-2.5 py-0.5 text-xs font-semibold text-violet-700 dark:text-violet-300 ring-1 ring-inset ring-violet-500/20">
          <ShieldCheck className="h-3.5 w-3.5" />
          Manager scope
        </span>
      }
      categories={categories}
    />
  );
};
