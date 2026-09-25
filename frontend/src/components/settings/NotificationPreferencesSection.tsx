import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch } from '../ui/Switch';
import { SettingsRow } from '../ui/SettingsRow';
import { Bell, AlertTriangle, Printer, CalendarClock, Utensils, ShieldAlert } from 'lucide-react';

const NOTIFICATION_TYPES = [
  {
    key: 'MISSING_ATTENDANCE',
    labelKey: 'settings.notif.attendance.label',
    descKey: 'settings.notif.attendance.description',
    icon: AlertTriangle,
    iconClassName: 'text-amber-600 dark:text-amber-400',
    iconBgClassName: 'bg-amber-500/10',
  },
  {
    key: 'PRINTER_FAILURE',
    labelKey: 'settings.notif.printer.label',
    descKey: 'settings.notif.printer.description',
    icon: Printer,
    iconClassName: 'text-rose-600 dark:text-rose-400',
    iconBgClassName: 'bg-rose-500/10',
  },
  {
    key: 'PAYROLL_PERIOD_DUE',
    labelKey: 'settings.notif.payroll.label',
    descKey: 'settings.notif.payroll.description',
    icon: CalendarClock,
    iconClassName: 'text-sky-600 dark:text-sky-400',
    iconBgClassName: 'bg-sky-500/10',
  },
  {
    key: 'MENU_ITEM_UNAVAILABLE',
    labelKey: 'settings.notif.menu.label',
    descKey: 'settings.notif.menu.description',
    icon: Utensils,
    iconClassName: 'text-emerald-600 dark:text-emerald-400',
    iconBgClassName: 'bg-emerald-500/10',
  },
  {
    key: 'SYSTEM_OVERRIDE',
    labelKey: 'settings.notif.system.label',
    descKey: 'settings.notif.system.description',
    icon: ShieldAlert,
    iconClassName: 'text-violet-600 dark:text-violet-400',
    iconBgClassName: 'bg-violet-500/10',
  },
] as const;

const PREFS_KEY = 'cafeflow:notificationPrefs';

function loadNotificationPrefs(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return Object.fromEntries(NOTIFICATION_TYPES.map((t) => [t.key, true]));
}

function saveNotificationPrefs(prefs: Record<string, boolean>) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

export const NotificationPreferencesSection: React.FC = () => {
  const { t } = useTranslation();
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>(loadNotificationPrefs);

  const toggleNotifPref = (key: string, checked: boolean) => {
    const next = { ...notifPrefs, [key]: checked };
    setNotifPrefs(next);
    saveNotificationPrefs(next);
  };

  return (
    <div>
      <SettingsRow
        icon={Bell}
        iconClassName="text-primary"
        iconBgClassName="bg-primary/10"
        title={t('settings.notif.channelsTitle')}
        description={t('settings.notif.channelsDescription')}
      />
      {NOTIFICATION_TYPES.map((n) => (
        <SettingsRow
          key={n.key}
          icon={n.icon}
          iconClassName={n.iconClassName}
          iconBgClassName={n.iconBgClassName}
          title={t(n.labelKey)}
          description={t(n.descKey)}
          divider
          control={
            <Switch
              checked={notifPrefs[n.key] !== false}
              onCheckedChange={(checked) => toggleNotifPref(n.key, checked)}
              aria-label={t(n.labelKey)}
            />
          }
        />
      ))}
    </div>
  );
};
