import React from 'react';
import { NotificationPreferencesSection } from '../../components/settings/NotificationPreferencesSection';
import { CashierOrderingToggle } from '../../components/settings/CashierOrderingToggle';
import { TableCountSetting } from '../../components/settings/TableCountSetting';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { ShoppingCart } from 'lucide-react';

/**
 * Manager Settings page — Phase 14, §3.3.
 *
 * Layers:
 *   1. Notification preferences      (shared, per-device)
 *   2. Cashier-ordering toggle       (Manager can edit the same global toggle as Owner;
 *                                     component itself notes "applies to all stations")
 *
 * No business-profile or printers-shortcut here — those are Owner-only.
 */
export const ManagerSettings: React.FC = () => {
  return (
    <div className="space-y-6">
      <header>
        <h3 className="text-lg font-bold">Settings</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage notifications and the system behavior shared with Owners.
        </p>
      </header>

      <NotificationPreferencesSection />

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-primary" />
            Cashier Ordering
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CashierOrderingToggle />
          <TableCountSetting />
        </CardContent>
      </Card>
    </div>
  );
};
