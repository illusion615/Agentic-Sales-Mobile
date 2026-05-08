/**
 * English display label mappings for Dataverse choice values.
 * The Dataverse schema has Chinese labels that cannot be modified.
 * This file provides English display labels for the UI.
 */

// Account Region - Chinese labels to English display
export const RegionToEnglish: Record<string, string> = {
  '华东': 'East',
  '华北': 'North',
  '华南': 'South',
  '西南': 'West',
};

// Account Credit Status - Chinese labels to English display
export const CreditStatusToEnglish: Record<string, string> = {
  '正常': 'Normal',
  '预警': 'Warning',
  '冻结': 'Frozen',
};

// Account Payment Status - Chinese labels to English display
export const PaymentStatusToEnglish: Record<string, string> = {
  '正常': 'Normal',
  '逾期': 'Overdue',
  '催收中': 'In Collection',
};

// Activity Outcome - Chinese labels to English display
export const ActivityOutcomeToEnglish: Record<string, string> = {
  '成功': 'Success',
  '拖延': 'Delayed',
  '人员变动': 'Personnel Change',
  '承诺后推迟': 'Promised Then Delayed',
  '无结果': 'No Result',
};

// Task Status - Chinese labels to English display
export const TaskStatusToEnglish: Record<string, string> = {
  '待办': 'Pending',
  '进行中': 'In Progress',
  '已完成': 'Completed',
  '已取消': 'Cancelled',
};

// Task Priority - Chinese labels to English display
export const TaskPriorityToEnglish: Record<string, string> = {
  '高': 'High',
  '中': 'Medium',
  '低': 'Low',
};

/**
 * Convert any Chinese label to English.
 * Falls back to original value if no mapping exists.
 */
export function toEnglish(chineseLabel: string | undefined | null): string {
  if (!chineseLabel) return '';
  return (
    RegionToEnglish[chineseLabel] ||
    CreditStatusToEnglish[chineseLabel] ||
    PaymentStatusToEnglish[chineseLabel] ||
    ActivityOutcomeToEnglish[chineseLabel] ||
    TaskStatusToEnglish[chineseLabel] ||
    TaskPriorityToEnglish[chineseLabel] ||
    chineseLabel
  );
}

/**
 * Helper to get English region label from the key-based label
 */
export function getRegionEnglish(regionLabel: string | undefined | null): string {
  return RegionToEnglish[regionLabel || ''] || regionLabel || '';
}

/**
 * Helper to get English credit status label
 */
export function getCreditStatusEnglish(statusLabel: string | undefined | null): string {
  return CreditStatusToEnglish[statusLabel || ''] || statusLabel || '';
}

/**
 * Helper to get English payment status label
 */
export function getPaymentStatusEnglish(statusLabel: string | undefined | null): string {
  return PaymentStatusToEnglish[statusLabel || ''] || statusLabel || '';
}

/**
 * Helper to get English activity outcome label
 */
export function getActivityOutcomeEnglish(outcomeLabel: string | undefined | null): string {
  return ActivityOutcomeToEnglish[outcomeLabel || ''] || outcomeLabel || '';
}

/**
 * Helper to get English task status label
 */
export function getTaskStatusEnglish(statusLabel: string | undefined | null): string {
  return TaskStatusToEnglish[statusLabel || ''] || statusLabel || '';
}

/**
 * Helper to get English task priority label
 */
export function getTaskPriorityEnglish(priorityLabel: string | undefined | null): string {
  return TaskPriorityToEnglish[priorityLabel || ''] || priorityLabel || '';
}
