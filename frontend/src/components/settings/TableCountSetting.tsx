import { extractErrorMessage } from '../../utils/errorHandler';
import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { axiosClient } from '../../api/axiosClient';
import { useToastStore } from '../../store/toastStore';
import { useSystemSettingQuery } from '../../hooks/useCachedQueries';
import { useSocketStore } from '../../store/socketStore';
import { LoadingState } from '../common/LoadingState';
import { SettingsRow } from '../ui/SettingsRow';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { LayoutGrid, Save } from 'lucide-react';

export const TableCountSetting: React.FC = () => {
  const { addToast } = useToastStore();
  const queryClient = useQueryClient();
  const { socket } = useSocketStore();
  const settingQuery = useSystemSettingQuery('tableCount');

  const [isSaving, setIsSaving] = useState(false);
  const [tableCount, setTableCount] = useState('12');
  const [localValue, setLocalValue] = useState('12');

  useEffect(() => {
    if (settingQuery.data) {
      setTableCount(settingQuery.data.value || '12');
      setLocalValue(settingQuery.data.value || '12');
    }
  }, [settingQuery.data]);

  useEffect(() => {
    if (!socket) return;
    const handler = (payload: { value: string }) => {
      setTableCount(payload.value || '12');
      setLocalValue(payload.value || '12');
      queryClient.setQueryData(['systemSetting', 'tableCount'], (old: any) =>
        old ? { ...old, value: payload.value } : old,
      );
    };
    socket.on('settings:tableCountChanged', handler);
    return () => {
      socket.off('settings:tableCountChanged', handler);
    };
  }, [socket, queryClient]);

  const handleSave = async () => {
    const val = parseInt(localValue, 10);
    if (isNaN(val) || val < 1 || val > 100) {
      addToast({
        type: 'error',
        title: 'Invalid value',
        message: 'Table count must be a number between 1 and 100.',
      });
      return;
    }

    setIsSaving(true);
    try {
      await axiosClient.patch('/settings/system/tableCount', {
        value: val.toString(),
      });
      setTableCount(val.toString());
      queryClient.invalidateQueries({ queryKey: ['systemSetting', 'tableCount'] });
      addToast({
        type: 'success',
        title: 'Table count updated',
        message: `Cashier dashboard will now show ${val} tables.`,
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

  const isDirty = localValue !== tableCount;

  return (
    <SettingsRow
      icon={LayoutGrid}
      iconClassName="text-primary"
      iconBgClassName="bg-primary/10"
      title="Number of tables"
      description="Configure how many tables are available in the Cashier table map (1–100)."
      divider
      control={
        <div className="flex items-center gap-2">
          <div className="w-24">
            <Input
              type="number"
              min="1"
              max="100"
              value={localValue}
              onChange={(e) => setLocalValue(e.target.value)}
              disabled={isSaving}
              aria-label="Number of tables"
            />
          </div>
          {isDirty && (
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
              leftIcon={<Save className="h-4 w-4" />}
            >
              Save
            </Button>
          )}
        </div>
      }
    />
  );
};
