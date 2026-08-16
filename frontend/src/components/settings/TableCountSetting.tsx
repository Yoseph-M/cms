import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { axiosClient } from '../../api/axiosClient';
import { useToastStore } from '../../store/toastStore';
import { useSystemSettingQuery } from '../../hooks/useCachedQueries';
import { useSocketStore } from '../../store/socketStore';
import { LoadingState } from '../common/LoadingState';

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
        old ? { ...old, value: payload.value } : old
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
    <div className="flex items-start justify-between gap-4 mt-6 pt-6 border-t border-border">
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">Number of Tables</p>
        <p className="text-xs text-muted-foreground max-w-lg">
          Configure how many tables are available in the Cashier table map.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min="1"
          max="100"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          disabled={isSaving}
          className="h-9 w-20 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
        {isDirty && (
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="h-9 px-3 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            Save
          </button>
        )}
      </div>
    </div>
  );
};
