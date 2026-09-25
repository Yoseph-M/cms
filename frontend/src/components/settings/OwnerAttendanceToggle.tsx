import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { axiosClient } from '../../api/axiosClient';
import { useToastStore } from '../../store/toastStore';
import { useSystemSettingQuery } from '../../hooks/useCachedQueries';
import { Switch } from '../ui/Switch';
import { SettingsRow } from '../ui/SettingsRow';
import { CalendarCheck } from 'lucide-react';

export const OwnerAttendanceToggle: React.FC = () => {
  const { t } = useTranslation();
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
        title: checked ? t('settings.attendance.enabledTitle') : t('settings.attendance.disabledTitle'),
        message: checked
          ? t('settings.attendance.enabledMsg')
          : t('settings.attendance.disabledMsg'),
      });
    } catch {
      addToast({ type: 'error', title: t('settings.updateFailedGeneric') });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingsRow
      icon={CalendarCheck}
      iconClassName="text-primary"
      iconBgClassName="bg-primary/10"
      title={t('settings.attendance.title')}
      description={t('settings.attendance.description')}
      control={
        <Switch
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={isSaving || settingQuery.isLoading}
          aria-label={t('settings.attendance.title')}
        />
      }
    />
  );
};
