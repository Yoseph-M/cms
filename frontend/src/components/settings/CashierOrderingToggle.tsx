import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { axiosClient } from '../../api/axiosClient';
import { useToastStore } from '../../store/toastStore';
import { useSystemSettingQuery } from '../../hooks/useCachedQueries';
import { useSocketStore } from '../../store/socketStore';
import { Switch } from '../ui/Switch';
import { LoadingState } from '../common/LoadingState';

export const CashierOrderingToggle: React.FC = () => {
  const { addToast } = useToastStore();
  const queryClient = useQueryClient();
  const { socket } = useSocketStore();
  const settingQuery = useSystemSettingQuery('cashierOrderingEnabled');
  const [isSaving, setIsSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (settingQuery.data) {
      setEnabled(settingQuery.data.value === 'true');
    }
  }, [settingQuery.data]);

  useEffect(() => {
    if (!socket) return;
    const handler = (payload: { value: string }) => {
      setEnabled(payload.value === 'true');
      queryClient.setQueryData(['systemSetting', 'cashierOrderingEnabled'], (old: any) =>
        old ? { ...old, value: payload.value } : old
      );
    };
    socket.on('settings:cashierOrderingChanged', handler);
    return () => {
      socket.off('settings:cashierOrderingChanged', handler);
    };
  }, [socket, queryClient]);

  const handleToggle = async (checked: boolean) => {
    setIsSaving(true);
    try {
      await axiosClient.patch('/settings/system/cashierOrderingEnabled', {
        value: checked ? 'true' : 'false',
      });
      setEnabled(checked);
      queryClient.invalidateQueries({ queryKey: ['systemSetting', 'cashierOrderingEnabled'] });
      addToast({
        type: 'success',
        title: checked ? 'Cashier ordering enabled' : 'Cashier ordering disabled',
        message: checked
          ? 'Cashiers can now create orders from their dashboard.'
          : 'Cashier order creation has been turned off.',
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Update failed',
        message: err.response?.data?.error || 'Could not update setting.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (settingQuery.isLoading) return <LoadingState message="Loading setting..." />;

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">Allow Cashiers to create orders directly</p>
        <p className="text-xs text-muted-foreground max-w-lg">
          When enabled, Cashier stations show a menu and cart for placing orders that flow through
          the same kitchen print pipeline as waiter orders. When disabled, Cashiers handle payment
          only.
        </p>
        <p className="text-xs text-accent font-medium">
          This applies to all Cashier stations.
        </p>
      </div>
      <Switch checked={enabled} onCheckedChange={handleToggle} disabled={isSaving} />
    </div>
  );
};
