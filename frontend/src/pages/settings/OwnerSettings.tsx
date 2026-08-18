import React from 'react';
import { NotificationPreferencesSection } from '../../components/settings/NotificationPreferencesSection';
import { BusinessProfileSection } from '../../components/settings/BusinessProfileSection';
import { CashierOrderingToggle } from '../../components/settings/CashierOrderingToggle';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { ShoppingCart, RotateCcw, CalendarCheck, Settings } from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { OwnerAttendanceToggle } from '../../components/settings/OwnerAttendanceToggle';
import { LanguagePreferenceSection } from '../../components/settings/LanguagePreferenceSection';
import { FeatureToggles } from '../../components/settings/FeatureToggles';

/**
 * Owner Settings page — Phase 14, §3.2.
 *
 * Layers (in order):
 *   1. Notification preferences      (shared, per-device)
 *   2. Business profile section      (Owner-only)
 *   3. Cashier-ordering toggle       (Owner-only — system setting)
 */
export const OwnerSettings: React.FC = () => {
  const { openWizard } = useOnboardingStore();

  return (
    <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6 animate-fade-in">
      <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold">Settings</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage your business profile, notifications, and system-wide behavior.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => openWizard(0)} className="gap-2 shrink-0">
          <RotateCcw className="w-4 h-4" />
          Re-run Setup Guide
        </Button>
      </header>

      <NotificationPreferencesSection />

      <LanguagePreferenceSection />

      <BusinessProfileSection />

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-primary" />
            Cashier Ordering
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CashierOrderingToggle />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-primary" />
            Attendance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <OwnerAttendanceToggle />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="w-4 h-4 text-primary" />
            Feature Toggles
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FeatureToggles />
        </CardContent>
      </Card>
    </div>
  );
};
