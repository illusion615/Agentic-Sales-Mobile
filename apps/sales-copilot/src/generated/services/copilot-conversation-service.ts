import { Crf5c_copilotconversationsService } from './Crf5c_copilotconversationsService';
import type { Crf5c_copilotconversations } from '../models/Crf5c_copilotconversationsModel';
import type { IGetAllOptions } from '../models/CommonModels';
import type { CopilotConversation } from '../models/copilot-conversation-model';

function fromDv(dv: Crf5c_copilotconversations): CopilotConversation {
  return {
    id: dv.crf5c_copilotconversationid,
    ownerid: dv.crf5c_ownerid,
    lastactiveon: dv.crf5c_lastactiveon,
    messagesjson: dv.crf5c_messagesjson,
    startedon: dv.crf5c_startedon,
  };
}

function toDv(r: Partial<Omit<CopilotConversation, 'id'>>): Record<string, unknown> {
  const dv: Record<string, unknown> = {};
  if (r.ownerid !== undefined) dv.crf5c_ownerid = r.ownerid;
  if (r.lastactiveon !== undefined) dv.crf5c_lastactiveon = r.lastactiveon;
  if (r.messagesjson !== undefined) dv.crf5c_messagesjson = r.messagesjson;
  if (r.startedon !== undefined) dv.crf5c_startedon = r.startedon;
  return dv;
}

export class CopilotConversationService {
  static async create(record: Omit<CopilotConversation, 'id'>): Promise<CopilotConversation> {
    const result = await Crf5c_copilotconversationsService.create(toDv(record) as any);
    if (!result.success) throw result.error;
    return fromDv(result.data!);
  }

  static async update(id: string, changedFields: Partial<Omit<CopilotConversation, 'id'>>): Promise<CopilotConversation> {
    const result = await Crf5c_copilotconversationsService.update(id, toDv(changedFields) as any);
    if (!result.success) throw result.error;
    return fromDv(result.data!);
  }

  static async delete(id: string): Promise<void> {
    await Crf5c_copilotconversationsService.delete(id);
  }

  static async get(id: string): Promise<CopilotConversation> {
    const result = await Crf5c_copilotconversationsService.get(id);
    if (!result.success) throw result.error;
    return fromDv(result.data!);
  }

  static async getAll(options?: IGetAllOptions): Promise<CopilotConversation[]> {
    const result = await Crf5c_copilotconversationsService.getAll(options);
    if (!result.success) throw result.error;
    return (result.data ?? []).map(fromDv);
  }
}