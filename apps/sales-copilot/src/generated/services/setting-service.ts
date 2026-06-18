import { Crf5c_settingsService } from './Crf5c_settingsService';
import type { Crf5c_settings } from '../models/Crf5c_settingsModel';
import type { IGetAllOptions } from '../models/CommonModels';
import type { Setting } from '../models/setting-model';
import { createWithReadback, requireId, withActiveState } from './_adapter-utils';

function fromDv(dv: Crf5c_settings): Setting {
  return {
    id: dv.crf5c_settingid,
    settingKey: dv.crf5c_settingkey,
    settingValue: dv.crf5c_settingvalue,
    description: dv.crf5c_description,
    updatedOn: dv.crf5c_updatedon,
  };
}

function toDv(r: Partial<Omit<Setting, 'id'>>): Record<string, unknown> {
  const dv: Record<string, unknown> = {};
  if (r.settingKey !== undefined) dv.crf5c_settingkey = r.settingKey;
  if (r.settingValue !== undefined) dv.crf5c_settingvalue = r.settingValue;
  if (r.description !== undefined) dv.crf5c_description = r.description;
  if (r.updatedOn !== undefined) dv.crf5c_updatedon = r.updatedOn;
  return dv;
}

export class SettingService {
  static async create(record: Omit<Setting, 'id'>): Promise<Setting> {
    const dvPayload = toDv(record);
    return createWithReadback(
      (p) => Crf5c_settingsService.create(p as any),
      (o) => Crf5c_settingsService.getAll(o),
      dvPayload, 'crf5c_settingid', 'Setting',
      `crf5c_settingkey eq '${record.settingKey}'`,
      fromDv,
    );
  }

  static async update(id: string, changedFields: Partial<Omit<Setting, 'id'>>): Promise<Setting> {
    requireId(id, 'update', 'Setting');
    const result = await Crf5c_settingsService.update(id, toDv(changedFields) as any);
    if (!result.success) throw result.error;
    return fromDv(result.data!);
  }

  static async delete(id: string): Promise<void> {
    requireId(id, 'delete', 'Setting');
    await Crf5c_settingsService.delete(id);
  }

  static async get(id: string): Promise<Setting> {
    requireId(id, 'get', 'Setting');
    const result = await Crf5c_settingsService.get(id);
    if (!result.success) throw result.error;
    return fromDv(result.data!);
  }

  static async getAll(options?: IGetAllOptions): Promise<Setting[]> {
    // Only read ACTIVE settings: an admin may deactivate (not delete) a setting,
    // and a deactivated setting must not take effect.
    const result = await Crf5c_settingsService.getAll(withActiveState(options as Record<string, unknown> | undefined) as any);
    if (!result.success) throw result.error;
    return (result.data ?? []).map(fromDv);
  }
}