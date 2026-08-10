import React, { useState } from 'react';
import { axiosClient } from '../../api/axiosClient';
import { useToastStore } from '../../store/toastStore';
import { useMeQuery } from '../../hooks/useCachedQueries';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Switch } from '../ui/Switch';
import { LoadingState } from '../common/LoadingState';
import { User, Lock, Bell } from 'lucide-react';

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

interface AccountSettingsPanelProps {
  showNotificationPrefs?: boolean;
}

export const AccountSettingsPanel: React.FC<AccountSettingsPanelProps> = ({
  showNotificationPrefs = false,
}) => {
  const { addToast } = useToastStore();
  const meQuery = useMeQuery();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>(loadNotificationPrefs);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      addToast({ type: 'error', title: 'Password mismatch', message: 'New passwords do not match.' });
      return;
    }
    setIsSavingPassword(true);
    try {
      await axiosClient.patch('/users/me/password', { currentPassword, newPassword });
      addToast({ type: 'success', title: 'Password updated', message: 'Your password has been changed.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Update failed',
        message: err.response?.data?.error || 'Could not update password.',
      });
    } finally {
      setIsSavingPassword(false);
    }
  };

  const toggleNotifPref = (key: string, checked: boolean) => {
    const next = { ...notifPrefs, [key]: checked };
    setNotifPrefs(next);
    saveNotificationPrefs(next);
  };

  if (meQuery.isLoading) return <LoadingState message="Loading profile..." />;

  const user = meQuery.data;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="w-4 h-4 text-primary" />
            Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Name</p>
              <p className="text-sm font-medium text-foreground">{user?.name}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Role</p>
              <p className="text-sm font-medium text-foreground font-mono">{user?.role}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Email</p>
              <p className="text-sm text-foreground">{user?.email || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Phone</p>
              <p className="text-sm text-foreground">{user?.phone || '—'}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Contact details are managed by your Owner or Manager. Ask them to update your record if
            anything is incorrect.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="w-4 h-4 text-primary" />
            Change Password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Current password</label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">New password</label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Confirm new password</label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" disabled={isSavingPassword}>
              {isSavingPassword ? 'Updating…' : 'Update Password'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {showNotificationPrefs && (
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
      )}
    </div>
  );
};
