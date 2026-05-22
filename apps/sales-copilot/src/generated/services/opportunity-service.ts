import { Crf5c_opportunity1sService } from './Crf5c_opportunity1sService';
import {
  type Crf5c_opportunity1s,
  Crf5c_opportunity1scrf5c_confidencetrend,
  Crf5c_opportunity1scrf5c_stage,
} from '../models/Crf5c_opportunity1sModel';
import type { IGetAllOptions } from '../models/CommonModels';
import {
  OpportunityConfidencetrendKeyToLabel,
  OpportunityStageKeyToLabel,
  type Opportunity,
} from '../models/opportunity-model';
import { labelToDv, dvNum, numToDv, mapOptions, dvChoice, dvLookupName, requireCreated, requireId } from './_adapter-utils';

const FIELD_MAP: Record<string, string> = {
  id: 'crf5c_opportunity1id',
  name1: 'crf5c_name',
  blocker: 'crf5c_blocker',
  closedon: 'crf5c_closedon',
  confidence: 'crf5c_confidence',
  createdon: 'crf5c_createdon',
  expectedclosedate: 'crf5c_expectedclosedate',
  lastaction: 'crf5c_lastaction',
  ownerid: 'crf5c_ownerid',
  totalamount: 'crf5c_totalamount',
};

function fromDv(dv: Crf5c_opportunity1s): Opportunity {
  const d = dv as unknown as Record<string, unknown>;
  return {
    id: dv.crf5c_opportunity1id,
    name1: dv.crf5c_name,
    account: {
      id: (d._crf5c_account_value as string) ?? '',
      name1: dvLookupName(d, '_crf5c_account_value'),
    },
    blocker: dv.crf5c_blocker,
    closedon: dv.crf5c_closedon,
    confidence: dvNum(dv.crf5c_confidence),
    confidenceTrend: dvChoice(d, 'crf5c_confidencetrend', Crf5c_opportunity1scrf5c_confidencetrend),
    createdon: dv.crf5c_createdon,
    expectedclosedate: dv.crf5c_expectedclosedate,
    lastaction: dv.crf5c_lastaction,
    ownerid: dv.crf5c_ownerid,
    stage: dvChoice(d, 'crf5c_stage', Crf5c_opportunity1scrf5c_stage),
    totalamount: dvNum(dv.crf5c_totalamount) ?? 0,
  };
}

function toDv(r: Partial<Omit<Opportunity, 'id'>>): Record<string, unknown> {
  const dv: Record<string, unknown> = {};
  if (r.name1 !== undefined) dv.crf5c_name = r.name1;
  if (r.account?.id) dv['crf5c_Account@odata.bind'] = `/crf5c_account1s(${r.account.id})`;
  if (r.blocker !== undefined) dv.crf5c_blocker = r.blocker;
  if (r.closedon !== undefined) dv.crf5c_closedon = r.closedon;
  if (r.confidence !== undefined) dv.crf5c_confidence = numToDv(r.confidence);
  if (r.confidenceTrend !== undefined) dv.crf5c_confidencetrend = labelToDv(OpportunityConfidencetrendKeyToLabel, r.confidenceTrend);
  if (r.expectedclosedate !== undefined) dv.crf5c_expectedclosedate = r.expectedclosedate;
  if (r.lastaction !== undefined) dv.crf5c_lastaction = r.lastaction;
  if (r.ownerid !== undefined) dv.crf5c_ownerid = r.ownerid;
  if (r.stage !== undefined) dv.crf5c_stage = labelToDv(OpportunityStageKeyToLabel, r.stage);
  if (r.totalamount !== undefined) dv.crf5c_totalamount = numToDv(r.totalamount);
  return dv;
}

export class OpportunityService {
  static async create(record: Omit<Opportunity, 'id'>): Promise<Opportunity> {
    const result = await Crf5c_opportunity1sService.create(toDv(record) as any);
    if (!result.success) throw result.error;
    return fromDv(requireCreated(result.data, 'crf5c_opportunity1id', 'Opportunity'));
  }

  static async update(id: string, changedFields: Partial<Omit<Opportunity, 'id'>>): Promise<Opportunity> {
    requireId(id, 'update', 'Opportunity');
    const result = await Crf5c_opportunity1sService.update(id, toDv(changedFields) as any);
    if (!result.success) throw result.error;
    return fromDv(result.data!);
  }

  static async delete(id: string): Promise<void> {
    requireId(id, 'delete', 'Opportunity');
    await Crf5c_opportunity1sService.delete(id);
  }

  static async get(id: string): Promise<Opportunity> {
    requireId(id, 'get', 'Opportunity');
    const result = await Crf5c_opportunity1sService.get(id);
    if (!result.success) throw result.error;
    return fromDv(result.data!);
  }

  static async getAll(options?: IGetAllOptions): Promise<Opportunity[]> {
    const result = await Crf5c_opportunity1sService.getAll(mapOptions(options, FIELD_MAP) as any);
    if (!result.success) throw result.error;
    return (result.data ?? []).map(fromDv);
  }
}