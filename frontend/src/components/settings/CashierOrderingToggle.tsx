import { extractErrorMessage } from '../../utils/errorHandler';
import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { axiosClient } from '../../api/axiosClient';
import { useToastStore } from '../../store/toastStore';
import { useSystemSettingQuery } from '../../hooks/useCachedQueries';
import { useSocketStore } from '../../store/socketStore';
import { Switch } from '../ui/Switch';
import { SettingsRow } from '../ui/SettingsRow';
import { ShoppingCart } from 'lucide-react';
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
        old ? { ...old, value: payload.value } : old,
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
        message: extractErrorMessage(err) || 'Could not update setting.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (settingQuery.isLoading) return <LoadingState message="Loading setting..." />;

  return (
    <SettingsRow
      icon={ShoppingCart}
      iconClassName="text-primary"
      iconBgClassName="bg-primary/10"
      title="Allow cashiers to create orders directly"
      description="When on, cashier stations show a menu and cart for placing orders that flow through the same kitchen print pipeline as waiter orders. When off, cashiers handle payment only."
      meta={
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-0.5 font-medium text-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Applies to all cashier stations
        </span>
      }
      control={
        <Switch
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={isSaving}
          aria-label="Allow cashiers to create orders"
        />
      }
    />
  );
};
