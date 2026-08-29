import React, { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Switch } from '../ui/Switch';
import { SettingsRow } from '../ui/SettingsRow';
import { useToastStore } from '../../store/toastStore';
import { axiosClient } from '../../api/axiosClient';
import { useSettingsStore } from '../../store/settingsStore';
import { LayoutDashboard, ShieldCheck, UtensilsCrossed, TimerReset } from 'lucide-react';

interface FeatureToggle {
  key: string;
  name: string;
  description: string;
  action: string; // friendly sentence fragment used in toasts
  icon: LucideIcon;
  iconClassName: string;
  iconBgClassName: string;
}

const FEATURE_TOGGLES: FeatureToggle[] = [
  {
    key: 'managerDashboardEnabled',
    name: 'Manager Dashboard',
    description: 'Enable or disable access to the Manager Dashboard for MANAGER roles.',
    action: 'Managers can now',
    icon: LayoutDashboard,
    iconClassName: 'text-sky-600 dark:text-sky-400',
    iconBgClassName: 'bg-sky-500/10',
  },
  {
    key: 'systemAdministrationEnabled',
    name: 'System Administration',
    description: 'Enable or disable the System Administration area entirely.',
    action: 'You can now',
    icon: ShieldCheck,
    iconClassName: 'text-emerald-600 dark:text-emerald-400',
    iconBgClassName: 'bg-emerald-500/10',
  },
  {
    key: 'cashierMenuManagementEnabled',
    name: 'Cashier Menu Management',
    description: 'Allow cashiers to add, edit, or toggle availability of menu items.',
    action: 'Cashiers can now',
    icon: UtensilsCrossed,
    iconClassName: 'text-orange-600 dark:text-orange-400',
    iconBgClassName: 'bg-orange-500/10',
  },
  {
    key: 'shiftManagementEnabled',
    name: 'Shift Management',
    description:
      'Require cashiers to open and close shifts for cash drawer tracking. Disable for small cafés without shift-based operations.',
    action: 'Cashiers must now',
    icon: TimerReset,
    iconClassName: 'text-violet-600 dark:text-violet-400',
    iconBgClassName: 'bg-violet-500/10',
  },
];

export const FeatureToggles: React.FC = () => {
  const { settings, fetchSettings } = useSettingsStore();
  const addToast = useToastStore((state) => state.addToast);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  // Helper to get boolean state, defaulting to true if undefined
  const isEnabled = (key: string) => settings[key] !== 'false';

  const handleToggle = async (feature: FeatureToggle) => {
    const newValue = isEnabled(feature.key) ? 'false' : 'true';
    const isEnabling = newValue === 'true';

    setLoadingKey(feature.key);
    try {
      await axiosClient.patch(`/settings/system/${feature.key}`, { value: newValue });
      await fetchSettings();

      addToast({
        title: isEnabling
          ? `${feature.name} has been enabled. ${feature.action} access this feature.`
          : `${feature.name} has been disabled. Access has been restricted.`,
        type: 'success',
      });
    } catch {
      addToast({
        title: `Unable to ${isEnabling ? 'enable' : 'disable'} ${feature.name}. Please try again.`,
        type: 'error',
      });
    } finally {
      setLoadingKey(null);
    }
  };

  return (
    <div>
      {FEATURE_TOGGLES.map((feature, index) => {
        const Icon = feature.icon;
        return (
          <SettingsRow
            key={feature.key}
            icon={Icon}
            iconClassName={feature.iconClassName}
            iconBgClassName={feature.iconBgClassName}
            title={feature.name}
            description={feature.description}
            divider={index > 0}
            control={
              <Switch
                checked={isEnabled(feature.key)}
                onCheckedChange={() => handleToggle(feature)}
                disabled={loadingKey === feature.key}
                aria-label={feature.name}
              />
            }
          />
        );
      })}
    </div>
  );
};
