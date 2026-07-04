import { Crf5c_businessinsightsService } from './Crf5c_businessinsightsService';
import {
  type Crf5c_businessinsights,
  Crf5c_businessinsightscrf5c_referencetype,
  Crf5c_businessinsightscrf5c_type,
} from '../models/Crf5c_businessinsightsModel';
import type { IGetAllOptions } from '../models/CommonModels';
import {
  BusinessInsightReferencetypeKeyToLabel,
  BusinessInsightTypeKeyToLabel,
  type BusinessInsight,
} from '../models/business-insight-model';
import { labelToDv, dvNum, numToDv, mapOptions, dvChoice, requireCreated, requireId, withReadTimeout } from './_adapter-utils';

const FIELD_MAP: Record<string, string> = {
  id: 'crf5c_businessinsightid',
  title: 'crf5c_title',
  detailsjson: 'crf5c_detailsjson',
  displayorder: 'crf5c_displayorder',
  generatedon: 'crf5c_generatedon',
  isactive: 'crf5c_isactive',
  ownerid: '_ownerid_value',
  rationale: 'crf5c_rationale',
  referenceidsjson: 'crf5c_referenceidsjson',
  summary: 'crf5c_summary',
  validuntil: 'crf5c_validuntil',
};

function fromDv(dv: Crf5c_businessinsights): BusinessInsight {
  const d = dv as unknown as Record<string, unknown>;
  return {
    id: dv.crf5c_businessinsightid,
    title: dv.crf5c_title,
    detailsjson: dv.crf5c_detailsjson,
    displayorder: dv.crf5c_displayorder ?? 0,
    generatedon: dv.crf5c_generatedon,
    isactive: Boolean(dv.crf5c_isactive),
    ownerid: (dv as unknown as Record<string, unknown>)._ownerid_value as string ?? '',
    rationale: dv.crf5c_rationale,
    referenceidsjson: dv.crf5c_referenceidsjson,
    referenceType: dvChoice(d, 'crf5c_referencetype', Crf5c_businessinsightscrf5c_referencetype),
    summary: dv.crf5c_summary,
    type: dvChoice(d, 'crf5c_type', Crf5c_businessinsightscrf5c_type),
    validuntil: dv.crf5c_validuntil,
  };
}

function toDv(r: Partial<Omit<BusinessInsight, 'id'>>): Record<string, unknown> {
  const dv: Record<string, unknown> = {};
  if (r.title !== undefined) dv.crf5c_title = r.title;
  if (r.detailsjson !== undefined) dv.crf5c_detailsjson = r.detailsjson;
  if (r.displayorder !== undefined) dv.crf5c_displayorder = numToDv(r.displayorder);
  if (r.generatedon !== undefined) dv.crf5c_generatedon = r.generatedon;
  if (r.isactive !== undefined) dv.crf5c_isactive = r.isactive;
  if (r.rationale !== undefined) dv.crf5c_rationale = r.rationale;
  if (r.referenceidsjson !== undefined) dv.crf5c_referenceidsjson = r.referenceidsjson;
  if (r.referenceType !== undefined) dv.crf5c_referencetype = labelToDv(BusinessInsightReferencetypeKeyToLabel, r.referenceType);
  if (r.summary !== undefined) dv.crf5c_summary = r.summary;
  if (r.type !== undefined) dv.crf5c_type = labelToDv(BusinessInsightTypeKeyToLabel, r.type);
  if (r.validuntil !== undefined) dv.crf5c_validuntil = r.validuntil;
  return dv;
}

export class BusinessInsightService {
  static async create(record: Omit<BusinessInsight, 'id'>): Promise<BusinessInsight> {
    const result = await Crf5c_businessinsightsService.create(toDv(record) as any);
    if (!result.success) throw result.error;
    // Some Dataverse environments return success but no row body on create.
    // In that case, return a synthetic record with the input data.
    if (!result.data || typeof result.data !== 'object' || !(result.data as unknown as Record<string, unknown>).crf5c_businessinsightid) {
      console.warn('[BusinessInsight] Create succeeded but no row returned — using synthetic record');
      return {
        id: `temp-${Date.now()}`,
        ...record,
      };
    }
    return fromDv(result.data);
  }

  static async update(id: string, changedFields: Partial<Omit<BusinessInsight, 'id'>>): Promise<BusinessInsight> {
    requireId(id, 'update', 'BusinessInsight');
    const result = await Crf5c_businessinsightsService.update(id, toDv(changedFields) as any);
    if (!result.success) throw result.error;
    return fromDv(result.data!);
  }

  static async delete(id: string): Promise<void> {
    requireId(id, 'delete', 'BusinessInsight');
    await Crf5c_businessinsightsService.delete(id);
  }

  static async get(id: string): Promise<BusinessInsight> {
    requireId(id, 'get', 'BusinessInsight');
    const result = await Crf5c_businessinsightsService.get(id);
    if (!result.success) throw result.error;
    return fromDv(result.data!);
  }

  static async getAll(options?: IGetAllOptions): Promise<BusinessInsight[]> {
    const result = await withReadTimeout(
      Crf5c_businessinsightsService.getAll(mapOptions(options, FIELD_MAP) as any),
      'BusinessInsight.getAll',
    );
    if (!result.success) throw result.error;
    return (result.data ?? []).map(fromDv);
  }
}