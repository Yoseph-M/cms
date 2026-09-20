import { extractErrorMessage } from '../../utils/errorHandler';
import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { axiosClient } from '../../api/axiosClient';
import { useToastStore } from '../../store/toastStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useSystemSettingQuery } from '../../hooks/useCachedQueries';
import { Switch } from '../ui/Switch';
import { SettingsRow } from '../ui/SettingsRow';
import { UtensilsCrossed } from 'lucide-react';
import { LoadingState } from '../common/LoadingState';

const SETTING_KEY = 'ownerMenuEditEnabled';

/**
 * Menu editing for Owners.
 *
 * The catalogue ships read-only for this role: this switch is an *opt-in*,
 * off by default, and the server refuses menu mutations until it is on. Turning
 * it on unlocks add/edit/delete for the owner role; turning it off returns the
 * menu screen to browse-only mode.
 */
export const OwnerMenuEditToggle: React.FC = () => {
  const { addToast } = useToastStore();
  const { fetchSettings } = useSettingsStore();
  const queryClient = useQueryClient();
  const settingQuery = useSystemSettingQuery(SETTING_KEY);
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
      await axiosClient.patch(`/settings/system/${SETTING_KEY}`, {
        value: checked ? 'true' : 'false',
      });
      setEnabled(checked);
      queryClient.setQueryData(['systemSetting', SETTING_KEY], (old: any) => ({
        ...(old ?? { key: SETTING_KEY }),
        key: SETTING_KEY,
        value: checked ? 'true' : 'false',
      }));
      // The menu routes read `canEdit` from the shared settings store, so refresh
      // it immediately rather than waiting for the next sign-in.
      await fetchSettings();
      addToast({
          type: 'success',
          title: checked ? 'Owner menu editing enabled' : 'Owner menu editing disabled',
          message: checked
            ? 'Owners can now add, edit, and hide menu items.'
            : 'The menu is now read-only for owners.',
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
      iconClassName="text-emerald-600 dark:text-emerald-400"
      iconBgClassName="bg-emerald-500/10"
      title="Allow owner menu editing"
      description="Off by default — owners can browse the menu but not change it. Turn it on to unlock adding, editing, and hiding menu items for owners."
      control={
        <Switch
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={isSaving}
          aria-label="Allow owner and manager menu editing"
        />
      }
    />
  );
};
