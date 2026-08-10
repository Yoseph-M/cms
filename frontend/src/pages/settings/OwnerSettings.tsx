import React from 'react';
import { AccountSettingsPanel } from '../../components/settings/AccountSettingsPanel';
import { BusinessProfileSection, PrintersShortcut } from '../../components/settings/BusinessProfileSection';
import { CashierOrderingToggle } from '../../components/settings/CashierOrderingToggle';
import { ReceiptCustomizationSection } from '../../components/settings/ReceiptCustomizationSection';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { ShoppingCart } from 'lucide-react';

/**
 * Owner Settings page — Phase 14, §3.2.
 *
 * Layers (in order):
 *   1. Shared AccountSettingsPanel  (every role)
 *   2. Business profile section      (Owner-only)
 *   3. Cashier-ordering toggle       (Owner-only — system setting)
 *   4. Printers shortcut             (Owner-only — links to /owner/printers)
 */
export const OwnerSettings: React.FC = () => {
  return (
    <div className="space-y-6">
      <header>
        <h3 className="text-lg font-bold">Settings</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage your account, business profile, and system-wide behavior.
        </p>
      </header>

      <AccountSettingsPanel showNotificationPrefs />

      <BusinessProfileSection />

      <ReceiptCustomizationSection />

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

      <PrintersShortcut />
    </div>
  );
};
