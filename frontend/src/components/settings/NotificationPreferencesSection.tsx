import React, { useState } from 'react';
import { Switch } from '../ui/Switch';
import { SettingsRow } from '../ui/SettingsRow';
import { Bell, AlertTriangle, Printer, CalendarClock, Utensils, ShieldAlert } from 'lucide-react';

const NOTIFICATION_TYPES = [
  {
    key: 'MISSING_ATTENDANCE',
    label: 'Missing attendance alerts',
    description: 'Notify when a staff member has not clocked in for an active shift.',
    icon: AlertTriangle,
    iconClassName: 'text-amber-600 dark:text-amber-400',
    iconBgClassName: 'bg-amber-500/10',
  },
  {
    key: 'PRINTER_FAILURE',
    label: 'Printer failure alerts',
    description: 'Alert the moment a receipt or kitchen printer goes offline.',
    icon: Printer,
    iconClassName: 'text-rose-600 dark:text-rose-400',
    iconBgClassName: 'bg-rose-500/10',
  },
  {
    key: 'PAYROLL_PERIOD_DUE',
    label: 'Payroll period reminders',
    description: 'Get a heads-up before each payroll cut-off date.',
    icon: CalendarClock,
    iconClassName: 'text-sky-600 dark:text-sky-400',
    iconBgClassName: 'bg-sky-500/10',
  },
  {
    key: 'MENU_ITEM_UNAVAILABLE',
    label: 'Menu availability changes',
    description: 'When a popular item is marked unavailable, you’ll hear about it.',
    icon: Utensils,
    iconClassName: 'text-emerald-600 dark:text-emerald-400',
    iconBgClassName: 'bg-emerald-500/10',
  },
  {
    key: 'SYSTEM_OVERRIDE',
    label: 'System override notices',
    description: 'Critical alerts about manual changes to your live operation.',
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
        title="Notification channels"
        description="Choose which alert types reach your notification bell on this device. Other devices keep their own preferences."
      />
      {NOTIFICATION_TYPES.map((n) => (
        <SettingsRow
          key={n.key}
          icon={n.icon}
          iconClassName={n.iconClassName}
          iconBgClassName={n.iconBgClassName}
          title={n.label}
          description={n.description}
          divider
          control={
            <Switch
              checked={notifPrefs[n.key] !== false}
              onCheckedChange={(checked) => toggleNotifPref(n.key, checked)}
              aria-label={n.label}
            />
          }
        />
      ))}
    </div>
  );
};
