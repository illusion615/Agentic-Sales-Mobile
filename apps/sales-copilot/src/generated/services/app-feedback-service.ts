import { Biz_appfeedbacksService } from './Biz_appfeedbacksService';
import type { Biz_appfeedbacks } from '../models/Biz_appfeedbacksModel';
import type { IGetAllOptions } from '../models/CommonModels';
import type { AppFeedback } from '../models/app-feedback-model';
import { createWithReadback, mapOptions, requireId, withReadTimeout } from './_adapter-utils';

const FIELD_MAP: Record<string, string> = {
  id: 'biz_appfeedbackid',
  title: 'biz_title',
  type: 'biz_feedbacktype',
  description: 'biz_description',
  expectedOutcome: 'biz_expectedoutcome',
  reproductionSteps: 'biz_reproductionsteps',
  currentPage: 'biz_currentpage',
  appVersion: 'biz_appversion',
  buildId: 'biz_buildid',
  locale: 'biz_locale',
  device: 'biz_device',
  os: 'biz_os',
  browser: 'biz_browser',
  source: 'biz_source',
  status: 'biz_submissionstatus',
  clientRequestId: 'biz_clientrequestid',
  submittedOn: 'biz_submittedon',
  githubIssueNumber: 'biz_githubissuenumber',
  githubIssueUrl: 'biz_githubissueurl',
  syncError: 'biz_syncerror',
  createdon: 'createdon',
  ownerid: '_ownerid_value',
};

function fromDv(dv: Biz_appfeedbacks): AppFeedback {
  const raw = dv as unknown as Record<string, unknown>;
  return {
    id: dv.biz_appfeedbackid,
    title: dv.biz_title,
    type: dv.biz_feedbacktype === 'enhancement' ? 'enhancement' : 'bug',
    description: dv.biz_description,
    expectedOutcome: dv.biz_expectedoutcome,
    reproductionSteps: dv.biz_reproductionsteps,
    currentPage: dv.biz_currentpage,
    appVersion: dv.biz_appversion,
    buildId: dv.biz_buildid,
    locale: dv.biz_locale,
    device: dv.biz_device,
    os: dv.biz_os,
    browser: dv.biz_browser,
    source: dv.biz_source === 'manual' ? 'manual' : 'copilot',
    status: normalizeStatus(dv.biz_submissionstatus),
    clientRequestId: dv.biz_clientrequestid,
    submittedOn: dv.biz_submittedon,
    githubIssueNumber: dv.biz_githubissuenumber,
    githubIssueUrl: dv.biz_githubissueurl,
    syncError: dv.biz_syncerror,
    ownerid: raw._ownerid_value as string | undefined,
    createdon: dv.createdon,
  };
}

function normalizeStatus(value: string): AppFeedback['status'] {
  return ['collected', 'submitting', 'submitted', 'failed', 'duplicate'].includes(value)
    ? value as AppFeedback['status']
    : 'collected';
}

function toDv(record: Partial<Omit<AppFeedback, 'id'>>): Record<string, unknown> {
  const dv: Record<string, unknown> = {};
  if (record.title !== undefined) dv.biz_title = record.title;
  if (record.type !== undefined) dv.biz_feedbacktype = record.type;
  if (record.description !== undefined) dv.biz_description = record.description;
  if (record.expectedOutcome !== undefined) dv.biz_expectedoutcome = record.expectedOutcome;
  if (record.reproductionSteps !== undefined) dv.biz_reproductionsteps = record.reproductionSteps;
  if (record.currentPage !== undefined) dv.biz_currentpage = record.currentPage;
  if (record.appVersion !== undefined) dv.biz_appversion = record.appVersion;
  if (record.buildId !== undefined) dv.biz_buildid = record.buildId;
  if (record.locale !== undefined) dv.biz_locale = record.locale;
  if (record.device !== undefined) dv.biz_device = record.device;
  if (record.os !== undefined) dv.biz_os = record.os;
  if (record.browser !== undefined) dv.biz_browser = record.browser;
  if (record.source !== undefined) dv.biz_source = record.source;
  if (record.status !== undefined) dv.biz_submissionstatus = record.status;
  if (record.clientRequestId !== undefined) dv.biz_clientrequestid = record.clientRequestId;
  if (record.submittedOn !== undefined) dv.biz_submittedon = record.submittedOn;
  if (record.githubIssueNumber !== undefined) dv.biz_githubissuenumber = record.githubIssueNumber;
  if (record.githubIssueUrl !== undefined) dv.biz_githubissueurl = record.githubIssueUrl;
  if (record.syncError !== undefined) dv.biz_syncerror = record.syncError;
  return dv;
}

export class AppFeedbackService {
  static async create(record: Omit<AppFeedback, 'id'>): Promise<AppFeedback> {
    const dvPayload = toDv(record);
    return createWithReadback(
      (payload) => Biz_appfeedbacksService.create(payload as never),
      (options) => Biz_appfeedbacksService.getAll(options),
      dvPayload,
      'biz_appfeedbackid',
      'AppFeedback',
      `biz_clientrequestid eq '${record.clientRequestId.replace(/'/g, "''")}'`,
      fromDv,
    );
  }

  static async update(id: string, changedFields: Partial<Omit<AppFeedback, 'id'>>): Promise<AppFeedback> {
    requireId(id, 'update', 'AppFeedback');
    const result = await Biz_appfeedbacksService.update(id, toDv(changedFields) as never);
    if (!result.success) throw result.error;
    if (result.data) return fromDv(result.data);
    return AppFeedbackService.get(id);
  }

  static async get(id: string): Promise<AppFeedback> {
    requireId(id, 'get', 'AppFeedback');
    const result = await Biz_appfeedbacksService.get(id);
    if (!result.success || !result.data) throw result.error ?? new Error(`AppFeedback ${id} not found`);
    return fromDv(result.data);
  }

  static async getAll(options?: IGetAllOptions): Promise<AppFeedback[]> {
    const result = await withReadTimeout(
      Biz_appfeedbacksService.getAll(mapOptions(options, FIELD_MAP) as never),
      'AppFeedback.getAll',
    );
    if (!result.success) throw result.error;
    return (result.data ?? []).map(fromDv);
  }
}
