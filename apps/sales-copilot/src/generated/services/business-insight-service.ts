import { Crf5c_businessinsightsService } from './Crf5c_businessinsightsService';
import type { Crf5c_businessinsights } from '../models/Crf5c_businessinsightsModel';
import type { IGetAllOptions } from '../models/CommonModels';
import type { BusinessInsight, BusinessInsightReferencetypeKey, BusinessInsightTypeKey } from '../models/business-insight-model';
import { dvToKey, keyToDv, dvNum, numToDv } from './_adapter-utils';

function fromDv(dv: Crf5c_businessinsights): BusinessInsight {
  return {
    id: dv.crf5c_businessinsightid,
    title: dv.crf5c_title,
    detailsjson: dv.crf5c_detailsjson,
    displayorder: dvNum(dv.crf5c_displayorder) ?? 0,
    generatedon: dv.crf5c_generatedon,
    isactive: dv.crf5c_isactive === 1,
    ownerid: dv.crf5c_ownerid,
    rationale: dv.crf5c_rationale,
    referenceidsjson: dv.crf5c_referenceidsjson,
    referencetypeKey: dvToKey('ReferencetypeKey', dv.crf5c_referencetype) as BusinessInsightReferencetypeKey,
    summary: dv.crf5c_summary,
    typeKey: dvToKey('TypeKey', dv.crf5c_type) as BusinessInsightTypeKey,
    validuntil: dv.crf5c_validuntil,
  };
}

function toDv(r: Partial<Omit<BusinessInsight, 'id'>>): Record<string, unknown> {
  const dv: Record<string, unknown> = {};
  if (r.title !== undefined) dv.crf5c_title = r.title;
  if (r.detailsjson !== undefined) dv.crf5c_detailsjson = r.detailsjson;
  if (r.displayorder !== undefined) dv.crf5c_displayorder = numToDv(r.displayorder);
  if (r.generatedon !== undefined) dv.crf5c_generatedon = r.generatedon;
  if (r.isactive !== undefined) dv.crf5c_isactive = r.isactive ? 1 : 0;
  if (r.ownerid !== undefined) dv.crf5c_ownerid = r.ownerid;
  if (r.rationale !== undefined) dv.crf5c_rationale = r.rationale;
  if (r.referenceidsjson !== undefined) dv.crf5c_referenceidsjson = r.referenceidsjson;
  if (r.referencetypeKey !== undefined) dv.crf5c_referencetype = keyToDv(r.referencetypeKey);
  if (r.summary !== undefined) dv.crf5c_summary = r.summary;
  if (r.typeKey !== undefined) dv.crf5c_type = keyToDv(r.typeKey);
  if (r.validuntil !== undefined) dv.crf5c_validuntil = r.validuntil;
  return dv;
}

export class BusinessInsightService {
  static async create(record: Omit<BusinessInsight, 'id'>): Promise<BusinessInsight> {
    const result = await Crf5c_businessinsightsService.create(toDv(record) as any);
    if (!result.success) throw result.error;
    return fromDv(result.data!);
  }

  static async update(id: string, changedFields: Partial<Omit<BusinessInsight, 'id'>>): Promise<BusinessInsight> {
    const result = await Crf5c_businessinsightsService.update(id, toDv(changedFields) as any);
    if (!result.success) throw result.error;
    return fromDv(result.data!);
  }

  static async delete(id: string): Promise<void> {
    await Crf5c_businessinsightsService.delete(id);
  }

  static async get(id: string): Promise<BusinessInsight> {
    const result = await Crf5c_businessinsightsService.get(id);
    if (!result.success) throw result.error;
    return fromDv(result.data!);
  }

  static async getAll(options?: IGetAllOptions): Promise<BusinessInsight[]> {
    const result = await Crf5c_businessinsightsService.getAll(options);
    if (!result.success) throw result.error;
    return (result.data ?? []).map(fromDv);
  }
}