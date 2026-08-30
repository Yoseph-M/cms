import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, Globe, Settings, Sun } from 'lucide-react';
import { SettingsGroup } from '../../components/ui/SettingsGroup';
import { NotificationPreferencesSection } from '../../components/settings/NotificationPreferencesSection';
import { LanguagePreferenceSection } from '../../components/settings/LanguagePreferenceSection';
import { ThemePreferenceSection } from '../../components/settings/ThemePreferenceSection';
import { useHeaderStore } from '../../store/headerStore';

/**
 * Cashier Settings page — mirrors Manager/Owner structure but scoped to
 * what cashiers can change on this device.
 */
export const CashierSettings: React.FC = () => {
  const { t } = useTranslation('owner');
  const { setPageTitle, setShowDateRange } = useHeaderStore();

  useEffect(() => {
    setPageTitle({ title: 'Settings', subtitle: 'Personalize notifications and language for this device.' });
    setShowDateRange(false);
    return () => {
      setPageTitle({ title: 'Overview', subtitle: '' });
      setShowDateRange(false);
    };
  }, [setPageTitle, setShowDateRange]);

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
      <header className="relative overflow-hidden rounded-2xl border border-border/40 bg-card px-6 py-7 shadow-[0_18px_48px_-28px_rgba(15,23,42,0.30),0_4px_12px_-8px_rgba(249,115,22,0.10)] sm:px-8 sm:py-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-accent/10 blur-3xl"
        />
        <div className="relative flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_8px_24px_-10px_hsl(var(--primary)/0.55)] ring-1 ring-inset ring-white/10">
            <Settings className="h-6 w-6" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {t('settings.title', { defaultValue: 'Settings' })}
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Personalize notifications and language for this device.
            </p>
          </div>
        </div>
      </header>

      <div className="space-y-3">
        <SettingsGroup
          icon={Bell}
          iconClassName="text-violet-700 dark:text-violet-300"
          iconBgClassName="bg-violet-500/15"
          title="Notifications"
          description="Pick which alerts reach your notification bell on this device."
        >
          <NotificationPreferencesSection />
        </SettingsGroup>

        <SettingsGroup
          icon={Globe}
          iconClassName="text-violet-700 dark:text-violet-300"
          iconBgClassName="bg-violet-500/15"
          title="Language"
          description="Choose how the app reads. Saved to your account so it follows you across devices."
        >
          <LanguagePreferenceSection />
        </SettingsGroup>

        <SettingsGroup
          icon={Sun}
          iconClassName="text-violet-700 dark:text-violet-300"
          iconBgClassName="bg-violet-500/15"
          title="Appearance"
          description={"Switch the app between light and dark. \"System\" uses the app's default light mode."}
        >
          <ThemePreferenceSection />
        </SettingsGroup>
      </div>
    </div>
  );
};
