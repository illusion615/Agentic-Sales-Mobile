import { Crf5c_briefingsService } from './Crf5c_briefingsService';
import type { Crf5c_briefings } from '../models/Crf5c_briefingsModel';
import type { IGetAllOptions } from '../models/CommonModels';
import type { Briefing } from '../models/briefing-model';
import { dvNum, numToDv } from './_adapter-utils';

function fromDv(dv: Crf5c_briefings): Briefing {
  return {
    id: dv.crf5c_briefingid,
    ownerid: dv.crf5c_ownerid,
    audiourl: dv.crf5c_audiourl,
    generatedon: dv.crf5c_generatedon,
    lastposition: dvNum(dv.crf5c_lastposition),
    payloadjson: dv.crf5c_payloadjson,
  };
}

function toDv(r: Partial<Omit<Briefing, 'id'>>): Record<string, unknown> {
  const dv: Record<string, unknown> = {};
  if (r.ownerid !== undefined) dv.crf5c_ownerid = r.ownerid;
  if (r.audiourl !== undefined) dv.crf5c_audiourl = r.audiourl;
  if (r.generatedon !== undefined) dv.crf5c_generatedon = r.generatedon;
  if (r.lastposition !== undefined) dv.crf5c_lastposition = numToDv(r.lastposition);
  if (r.payloadjson !== undefined) dv.crf5c_payloadjson = r.payloadjson;
  return dv;
}

export class BriefingService {
  static async create(record: Omit<Briefing, 'id'>): Promise<Briefing> {
    const result = await Crf5c_briefingsService.create(toDv(record) as any);
    if (!result.success) throw result.error;
    return fromDv(result.data!);
  }

  static async update(id: string, changedFields: Partial<Omit<Briefing, 'id'>>): Promise<Briefing> {
    const result = await Crf5c_briefingsService.update(id, toDv(changedFields) as any);
    if (!result.success) throw result.error;
    return fromDv(result.data!);
  }

  static async delete(id: string): Promise<void> {
    await Crf5c_briefingsService.delete(id);
  }

  static async get(id: string): Promise<Briefing> {
    const result = await Crf5c_briefingsService.get(id);
    if (!result.success) throw result.error;
    return fromDv(result.data!);
  }

  static async getAll(options?: IGetAllOptions): Promise<Briefing[]> {
    const result = await Crf5c_briefingsService.getAll(options);
    if (!result.success) throw result.error;
    return (result.data ?? []).map(fromDv);
  }
}