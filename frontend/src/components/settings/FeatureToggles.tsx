import React, { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Switch } from '../ui/Switch';
import { SettingsRow } from '../ui/SettingsRow';
import { useToastStore } from '../../store/toastStore';
import { axiosClient } from '../../api/axiosClient';
import { useSettingsStore } from '../../store/settingsStore';
import { LayoutDashboard, ShieldCheck } from 'lucide-react';

interface FeatureToggle {
  key: string;
  nameKey: string;
  descKey: string;
  actionKey: string;
  icon: LucideIcon;
  iconClassName: string;
  iconBgClassName: string;
}

const FEATURE_TOGGLES: FeatureToggle[] = [
  {
    key: 'managerDashboardEnabled',
    nameKey: 'settings.feature.managerDashboard.name',
    descKey: 'settings.feature.managerDashboard.description',
    actionKey: 'settings.feature.managerDashboard.action',
    icon: LayoutDashboard,
    iconClassName: 'text-sky-600 dark:text-sky-400',
    iconBgClassName: 'bg-sky-500/10',
  },
  {
    key: 'systemAdministrationEnabled',
    nameKey: 'settings.feature.systemAdmin.name',
    descKey: 'settings.feature.systemAdmin.description',
    actionKey: 'settings.feature.systemAdmin.action',
    icon: ShieldCheck,
    iconClassName: 'text-emerald-600 dark:text-emerald-400',
    iconBgClassName: 'bg-emerald-500/10',
  },
];

export const FeatureToggles: React.FC = () => {
  const { t } = useTranslation();
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
          ? t('settings.feature.enabledToast', { name: t(feature.nameKey), action: t(feature.actionKey) })
          : feature.key === 'managerDashboardEnabled'
            ? t('settings.feature.disabledMovedToast', { name: t(feature.nameKey) })
            : t('settings.feature.disabledToast', { name: t(feature.nameKey) }),
        type: 'success',
      });
    } catch {
      addToast({
        title: t('settings.feature.updateFailedToast', { name: t(feature.nameKey), action: t(isEnabling ? 'settings.feature.enableWord' : 'settings.feature.disableWord') }),
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
            title={t(feature.nameKey)}
            description={t(feature.descKey)}
            divider={index > 0}
            control={
              <Switch
                checked={isEnabled(feature.key)}
                onCheckedChange={() => handleToggle(feature)}
                disabled={loadingKey === feature.key}
                aria-label={t(feature.nameKey)}
              />
            }
          />
        );
      })}
    </div>
  );
};
