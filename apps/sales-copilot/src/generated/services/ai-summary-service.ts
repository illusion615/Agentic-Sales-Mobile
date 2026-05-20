import { Crf5c_aisummariesService } from './Crf5c_aisummariesService';
import type { Crf5c_aisummaries } from '../models/Crf5c_aisummariesModel';
import type { IGetAllOptions } from '../models/CommonModels';
import type { AISummary, AISummaryEntityTypeKey, AISummaryStatusKey } from '../models/ai-summary-model';
import { dvToKey, keyToDv } from './_adapter-utils';

function fromDv(dv: Crf5c_aisummaries): AISummary {
  return {
    id: dv.crf5c_aisummaryid,
    entityID: dv.crf5c_entityid,
    actionItems: dv.crf5c_actionitems,
    entityTypeKey: dvToKey('EntityTypeKey', dv.crf5c_entitytype) as AISummaryEntityTypeKey,
    expiresOn: dv.crf5c_expireson,
    generatedOn: dv.crf5c_generatedon,
    statusKey: dvToKey('StatusKey', dv.crf5c_status) as AISummaryStatusKey,
    summary: dv.crf5c_summary,
  };
}

function toDv(r: Partial<Omit<AISummary, 'id'>>): Record<string, unknown> {
  const dv: Record<string, unknown> = {};
  if (r.entityID !== undefined) dv.crf5c_entityid = r.entityID;
  if (r.actionItems !== undefined) dv.crf5c_actionitems = r.actionItems;
  if (r.entityTypeKey !== undefined) dv.crf5c_entitytype = keyToDv(r.entityTypeKey);
  if (r.expiresOn !== undefined) dv.crf5c_expireson = r.expiresOn;
  if (r.generatedOn !== undefined) dv.crf5c_generatedon = r.generatedOn;
  if (r.statusKey !== undefined) dv.crf5c_status = keyToDv(r.statusKey);
  if (r.summary !== undefined) dv.crf5c_summary = r.summary;
  return dv;
}

export class AISummaryService {
  static async create(record: Omit<AISummary, 'id'>): Promise<AISummary> {
    const result = await Crf5c_aisummariesService.create(toDv(record) as any);
    if (!result.success) throw result.error;
    return fromDv(result.data!);
  }

  static async update(id: string, changedFields: Partial<Omit<AISummary, 'id'>>): Promise<AISummary> {
    const result = await Crf5c_aisummariesService.update(id, toDv(changedFields) as any);
    if (!result.success) throw result.error;
    return fromDv(result.data!);
  }

  static async delete(id: string): Promise<void> {
    await Crf5c_aisummariesService.delete(id);
  }

  static async get(id: string): Promise<AISummary> {
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