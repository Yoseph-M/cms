import { extractErrorMessage } from '../../utils/errorHandler';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
        title: checked ? t('settings.menuEdit.restrictedTitle') : t('settings.menuEdit.allowedTitle'),
        message: checked
          ? t('settings.menuEdit.restrictedMsg')
          : t('settings.menuEdit.allowedMsg'),
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: t('settings.menuEdit.updateFailed'),
        message: extractErrorMessage(err) || t('settings.menuEdit.updateFailedMsg'),
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (settingQuery.isLoading) return <LoadingState message={t('loading')} />;

  return (
    <SettingsRow
      icon={UtensilsCrossed}
      iconClassName="text-blue-600 dark:text-blue-400"
      iconBgClassName="bg-blue-500/10"
      title={t('settings.menuEdit.title')}
      description={t('settings.menuEdit.description')}
      control={
        <Switch
          checked={restricted}
          onCheckedChange={handleToggle}
          disabled={isSaving}
          aria-label={t('settings.menuEdit.title')}
        />
      }
    />
  );
};
