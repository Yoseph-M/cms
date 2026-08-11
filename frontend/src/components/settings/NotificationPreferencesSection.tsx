import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Switch } from '../ui/Switch';
import { Bell } from 'lucide-react';

const NOTIFICATION_TYPES = [
  { key: 'MISSING_ATTENDANCE', label: 'Missing attendance alerts' },
  { key: 'PRINTER_FAILURE', label: 'Printer failure alerts' },
  { key: 'PAYROLL_PERIOD_DUE', label: 'Payroll period reminders' },
  { key: 'MENU_ITEM_UNAVAILABLE', label: 'Menu availability changes' },
  { key: 'SYSTEM_OVERRIDE', label: 'System override notices' },
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
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="w-4 h-4 text-primary" />
          Notification Preferences
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Choose which notification types appear in your bell menu. This only affects your
          device.
        </p>
        {NOTIFICATION_TYPES.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <span className="text-sm text-foreground">{label}</span>
            <Switch
              checked={notifPrefs[key] !== false}
              onCheckedChange={(checked) => toggleNotifPref(key, checked)}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
