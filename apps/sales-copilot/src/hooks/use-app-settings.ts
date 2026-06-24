import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSettingList, useCreateSetting, useUpdateSetting } from '@/generated/hooks/use-setting';
import type { Setting } from '@/generated/models/setting-model';

// Well-known setting keys
export const SETTING_KEYS = {
  POWER_AUTOMATE_FLOW_URL: 'power_automate_flow_url',
  COPILOT_STUDIO_AGENT_NAME: 'copilot_studio_agent_name',
} as const;

export type SettingKey = typeof SETTING_KEYS[keyof typeof SETTING_KEYS];

export interface AppSettings {
  powerAutomateFlowUrl: string | null;
  copilotStudioAgentName: string | null;
}

/**
 * Hook to read all app settings from the Setting table
 */
export function useAppSettings() {
  const { data: settings, isLoading, isFetching, error, refetch, isFetched } = useSettingList();

  const getSettingValue = (key: SettingKey): string | null => {
    if (!settings) return null;
    const setting = settings.find((s: Setting) => s.settingKey === key);
    return setting?.settingValue ?? null;
  };

  const getSettingId = (key: SettingKey): string | null => {
    if (!settings) return null;
    const setting = settings.find((s: Setting) => s.settingKey === key);
    return setting?.id ?? null;
  };

  const appSettings: AppSettings = {
    powerAutomateFlowUrl: getSettingValue(SETTING_KEYS.POWER_AUTOMATE_FLOW_URL),
    copilotStudioAgentName: getSettingValue(SETTING_KEYS.COPILOT_STUDIO_AGENT_NAME),
  };

  return {
    settings: appSettings,
    rawSettings: settings,
    isLoading,
    isFetching, // True when query is currently fetching (initial or refetch)
    isFetched, // True when query has completed at least once
    isError: !!error,
    error,
    refetch,
    getSettingValue,
    getSettingId,
  };
}

/**
 * Hook to get a single setting value by key
 */
export function useSettingValue(key: SettingKey) {
  const { data: settings, isLoading, error } = useSettingList();

  const value = settings?.find((s: Setting) => s.settingKey === key)?.settingValue ?? null;
  const settingId = settings?.find((s: Setting) => s.settingKey === key)?.id ?? null;

  return {
    value,
    settingId,
    isLoading,
    error,
  };
}

/**
 * Hook to upsert (create or update) a setting
 * Uses the latest settings data from the query to determine if record exists
 */
export function useUpsertSetting() {
  const queryClient = useQueryClient();
  const { data: settings, isFetched } = useSettingList();
  const createSetting = useCreateSetting();
  const updateSetting = useUpdateSetting();

  const upsertSetting = async (key: SettingKey, value: string, description?: string) => {
    // Find existing setting by key
    const existingSetting = settings?.find((s: Setting) => s.settingKey === key);

    if (existingSetting) {
      // Update existing record
      await updateSetting.mutateAsync({
        id: existingSetting.id,
        changedFields: {
          settingValue: value,
          updatedOn: new Date().toISOString(),
          ...(description ? { description } : {}),
        },
      });
    } else {
      // Create new record
      await createSetting.mutateAsync({
        settingKey: key,
        settingValue: value,
        description: description ?? '',
        updatedOn: new Date().toISOString(),
      });
    }

    // Invalidate to refetch latest data
    await queryClient.invalidateQueries({ queryKey: ['setting-list'] });
  };

  return {
    upsertSetting,
    isLoading: createSetting.isPending || updateSetting.isPending,
    error: createSetting.error || updateSetting.error,
    isReady: isFetched, // Only allow upsert after initial fetch completes
  };
}