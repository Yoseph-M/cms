import React from 'react';
import { AccountSettingsPanel } from '../../components/settings/AccountSettingsPanel';

/**
 * Cashier Settings page — Phase 14, §3.4.
 *
 * The shared account section only. No system-level toggles, per RBAC boundaries.
 * `showNotificationPrefs` is omitted: cashiers don't see the dashboard
 * notification bell the way Owners/Managers do, so per-type preferences would be
 * a dangling control.
 */
export const CashierSettings: React.FC = () => {
  return (
    <div className="space-y-6">
      <header>
        <h3 className="text-lg font-bold">Settings</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage your account.
        </p>
      </header>

      <AccountSettingsPanel />
    </div>
  );
};
