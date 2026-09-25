import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { axiosClient } from '../../api/axiosClient';
import { useToastStore } from '../../store/toastStore';
import { useSystemSettingQuery } from '../../hooks/useCachedQueries';
import { Switch } from '../ui/Switch';
import { SettingsRow } from '../ui/SettingsRow';
import { CalendarCheck } from 'lucide-react';

export const WorkOnSundaysToggle: React.FC = () => {
  const { t } = useTranslation();
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
        title: checked ? t('settings.sundays.enabledTitle') : t('settings.sundays.disabledTitle'),
        message: checked
          ? t('settings.sundays.enabledMsg')
          : t('settings.sundays.disabledMsg'),
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
      title={t('settings.sundays.title')}
      description={t('settings.sundays.description')}
      control={
        <Switch
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={isSaving || settingQuery.isLoading}
          aria-label={t('settings.sundays.title')}
        />
      }
    />
  );
};
