import { extractErrorMessage } from '../../utils/errorHandler';
import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { axiosClient } from '../../api/axiosClient';
import { useToastStore } from '../../store/toastStore';
import { useSystemSettingQuery } from '../../hooks/useCachedQueries';
import { useSocketStore } from '../../store/socketStore';
import { Switch } from '../ui/Switch';
import { SettingsRow } from '../ui/SettingsRow';
import { UtensilsCrossed } from 'lucide-react';
import { LoadingState } from '../common/LoadingState';

/**
 * Menu editing for cashiers.
 *
 * Cashiers can add, edit, and hide menu items out of the box. This switch is a
 * *restriction* — it is off by default, and turning it on makes the menu
 * read-only for cashiers until a manager turns it back off. Owners and managers
 * can always edit the menu regardless of this switch.
 */
export const MenuEditToggle: React.FC = () => {
  const { addToast } = useToastStore();
  const queryClient = useQueryClient();
  const { socket } = useSocketStore();
  const settingQuery = useSystemSettingQuery('cashierMenuEditRestricted');
  const [isSaving, setIsSaving] = useState(false);
  // The stored value is "is menu editing restricted?". Absent means unrestricted.
  const [restricted, setRestricted] = useState(false);

  useEffect(() => {
    if (settingQuery.data) {
      setRestricted(settingQuery.data.value === 'true');
    }
  }, [settingQuery.data]);

  useEffect(() => {
    if (!socket) return;
    const handler = (payload: { value: string }) => {
      setRestricted(payload.value === 'true');
      queryClient.setQueryData(['systemSetting', 'cashierMenuEditRestricted'], (old: any) =>
        old ? { ...old, value: payload.value } : old,
      );
    };
    socket.on('settings:menuEditChanged', handler);
    return () => {
      socket.off('settings:menuEditChanged', handler);
    };
  }, [socket, queryClient]);

  const handleToggle = async (checked: boolean) => {
    setIsSaving(true);
    try {
      await axiosClient.patch('/settings/system/cashierMenuEditRestricted', {
        value: checked ? 'true' : 'false',
      });
      setRestricted(checked);
      queryClient.invalidateQueries({ queryKey: ['systemSetting', 'cashierMenuEditRestricted'] });
      addToast({
        type: 'success',
        title: checked ? 'Menu editing restricted' : 'Menu editing allowed',
        message: checked
          ? 'Cashiers can view the menu but can no longer change it.'
          : 'Cashiers can add, edit, and hide menu items again.',
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Update failed',
        message: extractErrorMessage(err) || 'Could not update setting.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (settingQuery.isLoading) return <LoadingState message="Loading setting..." />;

  return (
    <SettingsRow
      icon={UtensilsCrossed}
      iconClassName="text-orange-600 dark:text-orange-400"
      iconBgClassName="bg-orange-500/10"
      title="Restrict cashier menu editing"
      description="Off by default — cashiers can add, edit, and hide menu items. Turn it on to make the menu read-only for cashiers. Owners and managers can always edit."
      control={
        <Switch
          checked={restricted}
          onCheckedChange={handleToggle}
          disabled={isSaving}
          aria-label="Restrict cashier menu editing"
        />
      }
    />
  );
};
