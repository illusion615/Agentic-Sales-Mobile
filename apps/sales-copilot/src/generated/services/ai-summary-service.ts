import { Crf5c_aisummariesService } from './Crf5c_aisummariesService';
import {
  type Crf5c_aisummaries,
  Crf5c_aisummariescrf5c_entitytype,
  Crf5c_aisummariescrf5c_status,
} from '../models/Crf5c_aisummariesModel';
import type { IGetAllOptions } from '../models/CommonModels';
import {
  AISummaryEntityTypeKeyToLabel,
  AISummaryStatusKeyToLabel,
  type AISummary,
} from '../models/ai-summary-model';
import { dvChoice, labelToDv, createWithReadback, requireId } from './_adapter-utils';

function fromDv(dv: Crf5c_aisummaries): AISummary {
  const d = dv as unknown as Record<string, unknown>;
  return {
    id: dv.crf5c_aisummaryid,
    entityID: dv.crf5c_entityid,
    actionItems: dv.crf5c_actionitems,
    entityType: dvChoice(d, 'crf5c_entitytype', Crf5c_aisummariescrf5c_entitytype),
    expiresOn: dv.crf5c_expireson,
    generatedOn: dv.crf5c_generatedon,
    status: dvChoice(d, 'crf5c_status', Crf5c_aisummariescrf5c_status),
    summary: dv.crf5c_summary,
    type: dv.biz_type,
  };
}

function toDv(r: Partial<Omit<AISummary, 'id'>>): Record<string, unknown> {
  const dv: Record<string, unknown> = {};
  if (r.entityID !== undefined) dv.crf5c_entityid = r.entityID;
  if (r.actionItems !== undefined) dv.crf5c_actionitems = r.actionItems;
  if (r.entityType !== undefined) dv.crf5c_entitytype = labelToDv(AISummaryEntityTypeKeyToLabel, r.entityType);
  if (r.expiresOn !== undefined) dv.crf5c_expireson = r.expiresOn;
  if (r.generatedOn !== undefined) dv.crf5c_generatedon = r.generatedOn;
  if (r.status !== undefined) dv.crf5c_status = labelToDv(AISummaryStatusKeyToLabel, r.status);
  if (r.summary !== undefined) dv.crf5c_summary = r.summary;
  if (r.type !== undefined) dv.biz_type = r.type;
  return dv;
}

export class AISummaryService {
  static async create(record: Omit<AISummary, 'id'>): Promise<AISummary> {
    const dvPayload = toDv(record);
    return createWithReadback(
      (p) => Crf5c_aisummariesService.create(p as any),
      (o) => Crf5c_aisummariesService.getAll(o),
      dvPayload, 'crf5c_aisummaryid', 'AISummary',
      `crf5c_entityid eq '${record.entityID}'`,
      fromDv,
    );
  }

  static async update(id: string, changedFields: Partial<Omit<AISummary, 'id'>>): Promise<AISummary> {
    requireId(id, 'update', 'AISummary');
    const result = await Crf5c_aisummariesService.update(id, toDv(changedFields) as any);
    if (!result.success) throw result.error;
    return fromDv(result.data!);
  }

  static async delete(id: string): Promise<void> {
    requireId(id, 'delete', 'AISummary');
    await Crf5c_aisummariesService.delete(id);
  }

  static async get(id: string): Promise<AISummary> {
    requireId(id, 'get', 'AISummary');
    const result = await Crf5c_aisummariesService.get(id);
    if (!result.success) throw result.error;
    return fromDv(result.data!);
  }

  static async getAll(options?: IGetAllOptions): Promise<AISummary[]> {
    const result = await Crf5c_aisummariesService.getAll(options);
    if (!result.success) throw result.error;
    return (result.data ?? []).map(fromDv);
  }
}