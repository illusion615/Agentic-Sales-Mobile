export type ChecklistResult = 'pass' | 'fail' | 'not-applicable';
export type AcceptanceStatus = 'draft' | 'signed' | 'delivery-pending' | 'delivered';

export interface AcceptanceItemDefinition {
  id: string;
  service: string;
  standard: string;
  requiredAttachment?: string;
}

export interface AcceptanceItemResult {
  itemId: string;
  result?: ChecklistResult;
  note?: string;
  attachmentName?: string;
  attachmentDataUrl?: string;
}

export interface SignatureRecord {
  signerName: string;
  signerRole?: string;
  signedAt: string;
  consentVersion: '1.0';
  contentHash: string;
  image: string;
}

export interface AcceptanceRecord {
  id: string;
  workOrderId: string;
  templateId: string;
  status: AcceptanceStatus;
  items: AcceptanceItemResult[];
  nonconformance?: string;
  customerFeedback?: string;
  customerRating?: 'satisfied' | 'neutral' | 'dissatisfied';
  recipientEmail?: string;
  signature?: SignatureRecord;
  deliveryRequestedAt?: string;
  deliveredAt?: string;
}

export const REPAIR_ACCEPTANCE_TEMPLATE: readonly AcceptanceItemDefinition[] = [
  { id: 'environment', service: '环境确认', standard: '电源、网络、温湿度和接地符合设备运行要求', requiredAttachment: '仪器使用环境照片' },
  { id: 'software', service: '软件信息确认', standard: '确认当前软件版本及运行状态', requiredAttachment: '状态界面照片' },
  { id: 'sampler', service: '自动进样器或级联', standard: '面板清洁，无灰尘、纸屑和异物', requiredAttachment: '维护后照片' },
  { id: 'rack', service: '试管架、适配器确认', standard: '试管架清洁，适配器配套正常且 RFID 可识别', requiredAttachment: '试管架照片' },
  { id: 'instrument', service: '仪器状态确认', standard: '温度、电压、光学增益、压力及试剂状态正常', requiredAttachment: '状态界面照片' },
  { id: 'columns', service: '层析柱确认', standard: '层析柱处于规定使用次数范围', requiredAttachment: '层析柱次数照片' },
  { id: 'filter', service: '柱前过滤器确认', standard: '过滤器处于规定使用次数范围' },
  { id: 'verification', service: '结果验证', standard: '样本重复性、质控及客户要求的测试达到要求', requiredAttachment: '验证结果照片' },
  { id: 'handover', service: '客户沟通', standard: '已向客户负责人汇报维修情况并说明后续事项；维修报告在签字后由系统生成' },
] as const;

export const TRAINING_ACCEPTANCE_TEMPLATE: readonly AcceptanceItemDefinition[] = [
  { id: 'overall', service: '整体介绍', standard: '掌握操作软件、仪器模块、试剂模块、装卸载平台、轨道及开关机操作' },
  { id: 'quality-control', service: '质控检测介绍', standard: '掌握质控设置、上机操作、质控结果和单机质控信息查看' },
  { id: 'sample', service: '样本检测介绍', standard: '掌握样本上机、自定义模式、轨道切换、复检规则、数据查看和急诊检测' },
  { id: 'protein', service: '特种蛋白校准', standard: '掌握特种蛋白模块校准操作；非特种蛋白用户可选不适用' },
  { id: 'reagent', service: '试剂更换介绍', standard: '掌握单机试剂及物料更换操作' },
  { id: 'fault', service: '故障处理介绍', standard: '掌握级联轨道及单机常见故障的处理方法' },
  { id: 'maintenance', service: '日常维护介绍', standard: '掌握单机模块日常维护及关机维护操作' },
] as const;

export function acceptanceTemplateId(incidentType?: string): string {
  return incidentType?.includes('培训') ? 'blood-cell-training@1' : 'repair-guidance@1';
}

export function acceptanceTemplate(templateId: string): readonly AcceptanceItemDefinition[] {
  return templateId === 'blood-cell-training@1' ? TRAINING_ACCEPTANCE_TEMPLATE : REPAIR_ACCEPTANCE_TEMPLATE;
}

export async function acceptanceContentHash(record: AcceptanceRecord): Promise<string> {
  const payload = JSON.stringify({
    templateId: record.templateId,
    workOrderId: record.workOrderId,
    items: [...record.items].sort((a, b) => a.itemId.localeCompare(b.itemId)),
    customerFeedback: record.customerFeedback ?? '',
    customerRating: record.customerRating ?? '',
  });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function acceptanceReadyToSign(record: AcceptanceRecord): boolean {
  return acceptanceTemplate(record.templateId).every((definition) => {
    const result = record.items.find((item) => item.itemId === definition.id);
    if (!result?.result) return false;
    if (result.result === 'fail' && !result.note?.trim()) return false;
    if (definition.requiredAttachment && (!result.attachmentName?.trim() || !result.attachmentDataUrl)) return false;
    return true;
  });
}

export function acceptanceLocked(record: AcceptanceRecord): boolean {
  return record.status !== 'draft';
}