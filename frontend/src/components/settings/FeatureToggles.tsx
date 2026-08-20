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

  // Human-readable feature names for notifications
  const featureNames: Record<string, { name: string; action: string }> = {
    'managerDashboardEnabled': { 
      name: 'Manager Dashboard', 
      action: 'Managers can now' 
    },
    'systemAdministrationEnabled': { 
      name: 'System Administration', 
      action: 'You can now' 
    },
    'cashierMenuManagementEnabled': { 
      name: 'Cashier Menu Management', 
      action: 'Cashiers can now' 
    },
    'shiftManagementEnabled': { 
      name: 'Shift Management', 
      action: 'Cashiers must now' 
    },
  };

  const handleToggle = async (key: string) => {
    const newValue = isEnabled(key) ? 'false' : 'true';
    const isEnabling = newValue === 'true';
    const feature = featureNames[key] || { name: key, action: 'Users can now' };
    
    setLoadingKey(key);
    try {
      await axiosClient.patch(`/settings/system/${key}`, { value: newValue });
      await fetchSettings();
      
      // Show user-friendly message based on action
      const message = isEnabling 
        ? `${feature.name} has been enabled. ${feature.action} access this feature.`
        : `${feature.name} has been disabled. Access has been restricted.`;
      
      addToast({ 
        title: message, 
        type: 'success' 
      });
    } catch (error) {
      addToast({ 
        title: `Unable to ${isEnabling ? 'enable' : 'disable'} ${feature.name}. Please try again.`, 
        type: 'error' 
      });
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

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <label className="text-sm font-semibold">Shift Management</label>
          <p className="text-xs text-muted-foreground">
            Require cashiers to open and close shifts for cash drawer tracking. Disable for small cafes without shift-based operations.
          </p>
        </div>
        <Switch
          checked={isEnabled('shiftManagementEnabled')}
          onCheckedChange={() => handleToggle('shiftManagementEnabled')}
          disabled={loadingKey === 'shiftManagementEnabled'}
        />
      </div>
    </div>
  );
};
