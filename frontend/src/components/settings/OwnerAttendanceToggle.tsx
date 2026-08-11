import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { axiosClient } from '../../api/axiosClient';
import { useToastStore } from '../../store/toastStore';
import { useSystemSettingQuery } from '../../hooks/useCachedQueries';
import { Switch } from '../ui/Switch';

export const OwnerAttendanceToggle: React.FC = () => {
  const { addToast } = useToastStore();
  const queryClient = useQueryClient();
  const settingQuery = useSystemSettingQuery('ownerCanEditAttendance');
  const [isSaving, setIsSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (settingQuery.data) {
      setEnabled(settingQuery.data.value === 'true');
    }
  }, [settingQuery.data]);

  const handleToggle = async (checked: boolean) => {
    setIsSaving(true);
    try {
      await axiosClient.patch('/settings/system/ownerCanEditAttendance', {
        value: checked ? 'true' : 'false',
      });
      setEnabled(checked);
      queryClient.invalidateQueries({ queryKey: ['systemSetting', 'ownerCanEditAttendance'] });
      addToast({
        type: 'success',
        title: checked ? 'Attendance editing enabled' : 'Attendance editing disabled',
        message: checked
          ? 'You can now correct historical attendance records.'
          : 'Owner attendance editing is off. Managers record attendance for today only.',
      });
    } catch {
      addToast({ type: 'error', title: 'Could not update setting' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-foreground">Allow me to edit attendance records</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          When on, you can correct historical attendance for any date. Every edit is audit-logged
          and requires a written reason. Off by default.
        </p>
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={handleToggle}
        disabled={isSaving || settingQuery.isLoading}
        aria-label="Allow owner to edit attendance records"
      />
    </div>
  );
};
