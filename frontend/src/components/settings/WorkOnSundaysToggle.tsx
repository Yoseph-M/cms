import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { axiosClient } from '../../api/axiosClient';
import { useToastStore } from '../../store/toastStore';
import { useSystemSettingQuery } from '../../hooks/useCachedQueries';
import { Switch } from '../ui/Switch';
import { SettingsRow } from '../ui/SettingsRow';
import { CalendarCheck } from 'lucide-react';

export const WorkOnSundaysToggle: React.FC = () => {
  const { addToast } = useToastStore();
  const queryClient = useQueryClient();
  const settingQuery = useSystemSettingQuery('workOnSundays');
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
      await axiosClient.patch('/settings/system/workOnSundays', {
        value: checked ? 'true' : 'false',
      });
      setEnabled(checked);
      queryClient.invalidateQueries({ queryKey: ['systemSetting', 'workOnSundays'] });
      addToast({
        type: 'success',
        title: checked ? 'Sundays are working days' : 'Sundays are not working days',
        message: checked
          ? 'Sundays will be treated as a regular working day in the attendance calendar.'
          : 'Sundays will be treated as a weekend in the attendance calendar.',
      });
    } catch {
      addToast({ type: 'error', title: 'Could not update setting' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingsRow
      icon={CalendarCheck}
      iconClassName="text-primary"
      iconBgClassName="bg-primary/10"
      title="Work on Sundays"
      description="When on, Sundays are treated as a working day in the attendance calendar. When off, Sundays are shown as a weekend."
      control={
        <Switch
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={isSaving || settingQuery.isLoading}
          aria-label="Work on Sundays"
        />
      }
    />
  );
};
