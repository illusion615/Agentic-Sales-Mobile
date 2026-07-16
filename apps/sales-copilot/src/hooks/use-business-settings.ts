import { useCallback, useMemo } from 'react';
import { useSettingList, useCreateSetting, useUpdateSetting } from '@/generated/hooks/use-setting';
import type { Setting } from '@/generated/models/setting-model';
import { useUser } from '@/hooks/use-user';
import {
  parseBusinessSettings,
  serializeBusinessSettings,
  businessSettingsKey,
  DEFAULT_BUSINESS_SETTINGS,
  type BusinessSettings,
} from '@/lib/business-settings';

/**
 * Per-user opportunity business settings, backed by one owner-scoped row in the
 * shared `crf5c_setting` key/value table (key = `business_settings:<objectId>`,
 * value = JSON). Reading is security-trimmed by Dataverse; the row is upserted on
 * save. Consumers get parsed defaults until the row loads.
 */
export function useBusinessSettings() {
  const { data: user } = useUser();
  const objectId = (user?.objectId || '').toLowerCase();
  const key = objectId ? businessSettingsKey(objectId) : '';

  const { data: allSettings = [], isLoading } = useSettingList();
  const createSetting = useCreateSetting();
  const updateSetting = useUpdateSetting();

  const row = useMemo(
    () => (key ? allSettings.find((s: Setting) => s.settingKey === key) : undefined),
    [allSettings, key],
  );

  const settings = useMemo<BusinessSettings>(
    () => (row ? parseBusinessSettings(row.settingValue) : { ...DEFAULT_BUSINESS_SETTINGS, targets: {} }),
    [row],
  );

  const save = useCallback(async (next: BusinessSettings) => {
    if (!key) return;
    const value = serializeBusinessSettings(next);
    const updatedOn = new Date().toISOString();
    if (row) {
      await updateSetting.mutateAsync({ id: row.id, changedFields: { settingValue: value, updatedOn } });
    } else {
      await createSetting.mutateAsync({
        settingKey: key,
        settingValue: value,
        description: 'Per-user opportunity business settings',
        updatedOn,
      });
    }
  }, [key, row, createSetting, updateSetting]);

  return {
    settings,
    save,
    isLoading,
    isSaving: createSetting.isPending || updateSetting.isPending,
    /** True once the current user id is known (settings can be persisted). */
    ready: !!key,
  };
}
