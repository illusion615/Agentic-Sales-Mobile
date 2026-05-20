/**
 * Unified Toast Utility
 * 
 * Provides consistent toast notifications with i18n support.
 * Consolidates all toast patterns across the app.
 */

import { toast, ExternalToast } from 'sonner';
import { getLocale, type Locale } from '@/lib/i18n';

// Toast message keys for i18n
const toastMessages = {
  'zh-Hans': {
    // Success messages
    connectionSuccess: '连接成功！',
    configCleared: '配置已清除',
    activityCreated: '活动已创建',
    opportunityCreated: '商机已创建',
    accountCreated: '客户已创建',
    contactCreated: '联系人已创建',
    reportCopied: '报告已复制到剪贴板',
    reportRefreshed: '报告已刷新',
    settingsSaved: '设置已保存',
    deleted: '已删除',
    updated: '已更新',
    saved: '已保存',
    recording: '开始录音...',
    recordingComplete: '录音完成，正在处理...',
    copilotConnected: 'Copilot Studio 已连接',
    
    // Error messages
    connectionFailed: '连接失败',
    configureFirst: '请先配置',
    createFailed: '创建失败，请重试',
    copyFailed: '复制失败',
    deleteFailed: '删除失败',
    updateFailed: '更新失败',
    accountNotFound: '未找到关联客户，请先创建客户',
    invalidResponse: '无效的响应',
    copilotNotConfigured: '请先配置 Copilot Studio',
    providerEndpointRequired: '请先配置提供商和端点',
    
    // Info messages
    processing: '正在处理...',
    reportSaved: '完整报告已保存到 code/reviews/',
    featureComingSoon: '功能即将上线',
    
    // Warning messages
    unsavedChanges: '有未保存的更改',
  },
  'en-US': {
    // Success messages
    connectionSuccess: 'Connected successfully!',
    configCleared: 'Configuration cleared',
    activityCreated: 'Activity created',
    opportunityCreated: 'Opportunity created',
    accountCreated: 'Account created',
    contactCreated: 'Contact created',
    reportCopied: 'Report copied to clipboard',
    reportRefreshed: 'Report refreshed',
    settingsSaved: 'Settings saved',
    deleted: 'Deleted',
    updated: 'Updated',
    saved: 'Saved',
    recording: 'Recording...',
    recordingComplete: 'Processing...',
    copilotConnected: 'Copilot Studio connected successfully',
    
    // Error messages
    connectionFailed: 'Connection failed',
    configureFirst: 'Please configure first',
    createFailed: 'Failed to create, please try again',
    copyFailed: 'Failed to copy',
    deleteFailed: 'Failed to delete',
    updateFailed: 'Failed to update',
    accountNotFound: 'Account not found, please create account first',
    invalidResponse: 'Invalid response',
    copilotNotConfigured: 'Please configure Copilot Studio first',
    providerEndpointRequired: 'Please configure provider and endpoint first',
    
    // Info messages
    processing: 'Processing...',
    reportSaved: 'Full report saved to code/reviews/',
    featureComingSoon: 'Coming soon',
    
    // Warning messages
    unsavedChanges: 'You have unsaved changes',
  },
} as const;

type ToastMessageKey = keyof typeof toastMessages['en-US'];

// Default toast durations
const TOAST_DURATION = {
  success: 2000,
  error: 4000,
  info: 2000,
  warning: 3000,
  recording: 1500,
} as const;

/**
 * Get localized message by key
 */
function getMessage(key: ToastMessageKey, locale?: Locale): string {
  const currentLocale = locale ?? getLocale();
  return toastMessages[currentLocale][key] ?? toastMessages['en-US'][key] ?? key;
}

/**
 * Show success toast with i18n support
 */
export function showSuccess(
  messageOrKey: ToastMessageKey | string,
  options?: ExternalToast & { locale?: Locale; params?: Record<string, string | number> }
): void {
  const { locale, params, ...toastOptions } = options ?? {};
  let message = messageOrKey in toastMessages['en-US']
    ? getMessage(messageOrKey as ToastMessageKey, locale)
    : messageOrKey;
  
  // Replace params if provided
  if (params) {
    Object.entries(params).forEach(([key, value]: [string, string | number]) => {
      message = message.replace(`{${key}}`, String(value));
    });
  }
  
  toast.success(message, {
    duration: TOAST_DURATION.success,
    ...toastOptions,
  });
}

/**
 * Show error toast with i18n support
 */
export function showError(
  messageOrKey: ToastMessageKey | string,
  options?: ExternalToast & { locale?: Locale; detail?: string }
): void {
  const { locale, detail, ...toastOptions } = options ?? {};
  let message = messageOrKey in toastMessages['en-US']
    ? getMessage(messageOrKey as ToastMessageKey, locale)
    : messageOrKey;
  
  // Append detail if provided
  if (detail) {
    message = `${message}: ${detail}`;
  }
  
  toast.error(message, {
    duration: TOAST_DURATION.error,
    ...toastOptions,
  });
}

/**
 * Show info toast with i18n support
 */
export function showInfo(
  messageOrKey: ToastMessageKey | string,
  options?: ExternalToast & { locale?: Locale }
): void {
  const { locale, ...toastOptions } = options ?? {};
  const message = messageOrKey in toastMessages['en-US']
    ? getMessage(messageOrKey as ToastMessageKey, locale)
    : messageOrKey;
  
  toast.info(message, {
    duration: TOAST_DURATION.info,
    ...toastOptions,
  });
}

/**
 * Show warning toast with i18n support
 */
export function showWarning(
  messageOrKey: ToastMessageKey | string,
  options?: ExternalToast & { locale?: Locale }
): void {
  const { locale, ...toastOptions } = options ?? {};
  const message = messageOrKey in toastMessages['en-US']
    ? getMessage(messageOrKey as ToastMessageKey, locale)
    : messageOrKey;
  
  toast.warning(message, {
    duration: TOAST_DURATION.warning,
    ...toastOptions,
  });
}

/**
 * Show recording status toast (short duration)
 */
export function showRecording(locale?: Locale): void {
  toast.info(getMessage('recording', locale), {
    duration: TOAST_DURATION.recording,
  });
}

/**
 * Show recording complete toast
 */
export function showRecordingComplete(locale?: Locale): void {
  toast.success(getMessage('recordingComplete', locale), {
    duration: TOAST_DURATION.success,
  });
}

// Export toast message keys for type safety
export type { ToastMessageKey };

// Re-export raw toast for advanced use cases
export { toast };
