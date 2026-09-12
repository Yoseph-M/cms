import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Building2,
  Sparkles,
  ShieldCheck,
  SlidersHorizontal,
  RotateCcw,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { SettingsShell, type SettingsShellCategory } from '../../components/settings/SettingsShell';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useHeaderStore } from '../../store/headerStore';

import { BusinessProfileSection } from '../../components/settings/BusinessProfileSection';
import { ThemePreferenceSection } from '../../components/settings/ThemePreferenceSection';
import { LanguagePreferenceSection } from '../../components/settings/LanguagePreferenceSection';
import { NotificationPreferencesSection } from '../../components/settings/NotificationPreferencesSection';
import { CashierOrderingToggle } from '../../components/settings/CashierOrderingToggle';
import { OwnerAttendanceToggle } from '../../components/settings/OwnerAttendanceToggle';
import { WorkOnSundaysToggle } from '../../components/settings/WorkOnSundaysToggle';
import { FeatureToggles } from '../../components/settings/FeatureToggles';

export const OwnerSettings: React.FC = () => {
  const { t } = useTranslation('owner');
  const { openWizard } = useOnboardingStore();
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
      id: 'business',
      label: 'Business Profile',
      description: 'Store name, address, contact, and currency configuration',
      icon: Building2,
      iconClassName: 'text-amber-600 dark:text-amber-400',
      iconBgClassName: 'bg-amber-500/10',
      items: [
        {
          id: 'business-profile',
          title: 'Store & Receipt Details',
          description: 'Information printed on customer receipts and reports across all terminals.',
          keywords: ['business', 'store', 'name', 'address', 'phone', 'currency', 'etb', 'receipt'],
          content: <BusinessProfileSection />,
        },
      ],
    },
    {
      id: 'preferences',
      label: 'Preferences',
      description: 'Theme appearance, language, and notification channels',
      icon: Sparkles,
      iconClassName: 'text-violet-600 dark:text-violet-400',
      iconBgClassName: 'bg-violet-500/10',
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
      label: 'Access & Operations',
      description: 'POS cashier ordering rules and operational schedules',
      icon: ShieldCheck,
      iconClassName: 'text-emerald-600 dark:text-emerald-400',
      iconBgClassName: 'bg-emerald-500/10',
      items: [
        {
          id: 'ordering',
          title: 'Cashier POS Ordering',
          description: 'Enable or restrict order placement directly from the cashier terminal.',
          keywords: ['ordering', 'cashier', 'pos', 'tickets', 'checkout', 'access'],
          content: <CashierOrderingToggle />,
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
      ],
    },
    {
      id: 'features',
      label: 'Feature Toggles',
      description: 'Enable or disable major system modules workspace-wide',
      icon: SlidersHorizontal,
      iconClassName: 'text-sky-600 dark:text-sky-400',
      iconBgClassName: 'bg-sky-500/10',
      items: [
        {
          id: 'feature-toggles',
          title: 'System Feature Management',
          description: 'Control access to optional modules such as shift management, manager dashboards, and system administration.',
          keywords: ['features', 'toggles', 'manager dashboard', 'system admin', 'shift management', 'menu management'],
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
      badge={
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-500/20">
          <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--success))]" />
          Synchronized
        </span>
      }
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => openWizard(0)}
          leftIcon={<RotateCcw className="h-4 w-4" />}
        >
          {t('settings.reRunSetup', { defaultValue: 'Re-run Setup Guide' })}
        </Button>
      }
      categories={categories}
    />
  );
};
