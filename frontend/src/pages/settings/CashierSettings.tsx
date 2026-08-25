import React from 'react';
import { NotificationPreferencesSection } from '../../components/settings/NotificationPreferencesSection';
import { LanguagePreferenceSection } from '../../components/settings/LanguagePreferenceSection';
import { ThemePreferenceSection } from '../../components/settings/ThemePreferenceSection';

/**
 * Cashier Settings page — mirrors Manager/Owner structure but scoped to
 * what cashiers can change on this device:
 *   1. Notification preferences      (shared, per-device)
 *   2. Language preference          (shared, per-account)
 *
 * Business-profile, ordering toggle, table count and feature toggles
 * remain Owner/Manager-only and are intentionally omitted.
 */
export const CashierSettings: React.FC = () => {
  return (
    <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6 animate-fade-in">
      <header>
        <h3 className="text-lg font-bold">Settings</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Personalize notifications and language for this device.
        </p>
      </header>

      <NotificationPreferencesSection />

      <LanguagePreferenceSection />

      <ThemePreferenceSection />
    </div>
  );
};
