import { Crf5c_agentlogsService } from './Crf5c_agentlogsService';
import type { Crf5c_agentlogs } from '../models/Crf5c_agentlogsModel';
import type { IGetAllOptions } from '../models/CommonModels';
import type { AgentLog } from '../models/agent-log-model';
import { requireCreated, requireId } from './_adapter-utils';

function fromDv(dv: Crf5c_agentlogs): AgentLog {
  return {
    id: dv.crf5c_agentlogid,
    logName: dv.crf5c_logname,
    agentName: dv.crf5c_agentname,
    queryText: dv.crf5c_querytext,
    responseText: dv.crf5c_responsetext,
    sessionID: dv.crf5c_sessionid,
    sourceDescription: dv.crf5c_sourcedescription,
    timestamp: dv.crf5c_timestamp,
  };
}

function toDv(r: Partial<Omit<AgentLog, 'id'>>): Record<string, unknown> {
  const dv: Record<string, unknown> = {};
  if (r.logName !== undefined) dv.crf5c_logname = r.logName;
  if (r.agentName !== undefined) dv.crf5c_agentname = r.agentName;
  if (r.queryText !== undefined) dv.crf5c_querytext = r.queryText;
  if (r.responseText !== undefined) dv.crf5c_responsetext = r.responseText;
  if (r.sessionID !== undefined) dv.crf5c_sessionid = r.sessionID;
  if (r.sourceDescription !== undefined) dv.crf5c_sourcedescription = r.sourceDescription;
  if (r.timestamp !== undefined) dv.crf5c_timestamp = r.timestamp;
  return dv;
}

export class AgentLogService {
  static async create(record: Omit<AgentLog, 'id'>): Promise<AgentLog> {
    const result = await Crf5c_agentlogsService.create(toDv(record) as any);
    if (!result.success) throw result.error;
    return fromDv(requireCreated(result.data, 'crf5c_agentlogid', 'AgentLog'));
  }

  static async update(id: string, changedFields: Partial<Omit<AgentLog, 'id'>>): Promise<AgentLog> {
    requireId(id, 'update', 'AgentLog');
    const result = await Crf5c_agentlogsService.update(id, toDv(changedFields) as any);
    if (!result.success) throw result.error;
    return fromDv(result.data!);
  }

  static async delete(id: string): Promise<void> {
    requireId(id, 'delete', 'AgentLog');
    await Crf5c_agentlogsService.delete(id);
  }

  static async get(id: string): Promise<AgentLog> {
    requireId(id, 'get', 'AgentLog');
    const result = await Crf5c_agentlogsService.get(id);
    if (!result.success) throw result.error;
    return fromDv(result.data!);
  }

  static async getAll(options?: IGetAllOptions): Promise<AgentLog[]> {
    const result = await Crf5c_agentlogsService.getAll(options);
    if (!result.success) throw result.error;
    return (result.data ?? []).map(fromDv);
  }
}