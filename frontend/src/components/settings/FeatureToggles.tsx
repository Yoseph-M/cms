import React, { useState, useEffect } from 'react';
import { Switch } from '../ui/Switch';
import { useToastStore } from '../../store/toastStore';
import { axiosClient } from '../../api/axiosClient';
import { useSettingsStore } from '../../store/settingsStore';

export const FeatureToggles: React.FC = () => {
  const { settings, fetchSettings } = useSettingsStore();
  const addToast = useToastStore((state) => state.addToast);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  // Helper to get boolean state, defaulting to true if undefined
  const isEnabled = (key: string) => settings[key] !== 'false';

  const handleToggle = async (key: string) => {
    const newValue = isEnabled(key) ? 'false' : 'true';
    setLoadingKey(key);
    try {
      await axiosClient.patch(`/settings/system/${key}`, { value: newValue });
      await fetchSettings();
      addToast({ title: 'Feature setting updated successfully', type: 'success' });
    } catch (error) {
      addToast({ title: 'Failed to update feature setting', type: 'error' });
    } finally {
      setLoadingKey(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <label className="text-sm font-semibold">Manager Dashboard</label>
          <p className="text-xs text-muted-foreground">
            Enable or disable access to the Manager Dashboard for MANAGER roles.
          </p>
        </div>
        <Switch
          checked={isEnabled('managerDashboardEnabled')}
          onCheckedChange={() => handleToggle('managerDashboardEnabled')}
          disabled={loadingKey === 'managerDashboardEnabled'}
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <label className="text-sm font-semibold">System Administration</label>
          <p className="text-xs text-muted-foreground">
            Enable or disable the System Administration area.
          </p>
        </div>
        <Switch
          checked={isEnabled('systemAdministrationEnabled')}
          onCheckedChange={() => handleToggle('systemAdministrationEnabled')}
          disabled={loadingKey === 'systemAdministrationEnabled'}
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <label className="text-sm font-semibold">Cashier Menu Management</label>
          <p className="text-xs text-muted-foreground">
            Allow cashiers to add, edit, or toggle availability of menu items.
          </p>
        </div>
        <Switch
          checked={isEnabled('cashierMenuManagementEnabled')}
          onCheckedChange={() => handleToggle('cashierMenuManagementEnabled')}
          disabled={loadingKey === 'cashierMenuManagementEnabled'}
        />
      </div>
    </div>
  );
};
