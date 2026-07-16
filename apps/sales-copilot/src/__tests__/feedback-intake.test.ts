import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IntentResult } from '@/lib/copilot-agent-types';
import { assignAttachmentsToIntent, ATTACHMENT_IDS_KEY } from '@/lib/attachment-assign';
import { suggestSkillForIntent, tryParseFrame } from '@/lib/frame';
import { operationTypeFor } from '@/lib/cost-operation';
import { collectSafeFeedbackDiagnostics, safeFeedbackPage } from '@/lib/feedback-diagnostics';
import { detectAppFeedback, feedbackIntentFromSeed } from '@/lib/feedback-intent';

const dataMocks = vi.hoisted(() => ({
  createRecordAsync: vi.fn(),
  retrieveMultipleRecordsAsync: vi.fn(),
  updateRecordAsync: vi.fn(),
  retrieveRecordAsync: vi.fn(),
}));

vi.mock('@microsoft/power-apps/data', () => ({
  getClient: () => dataMocks,
}));

describe('feedback intent', () => {
  it('parses Feedback + Log and maps it to draftFeedback', () => {
    const frame = tryParseFrame(JSON.stringify({
      intents: [{
        salesObject: 'Feedback',
        cognitiveTask: 'Log',
        temporal: 'none',
        summary: 'Activity edit loses account',
        relatesTo: [],
      }],
      explicitNames: [],
      contextSufficient: false,
      reasoning: 'The user is reporting an app bug.',
      confidence: 98,
    }));

    expect(frame?.intents[0].salesObject).toBe('Feedback');
    expect(suggestSkillForIntent(frame!.intents[0])).toBe('draftFeedback');
    expect(operationTypeFor('draftFeedback')).toBe('feedback.submit');
  });

  it('uses a high-precision deterministic gate for explicit app feedback', () => {
    const seed = detectAppFeedback('Bug: Activity detail is blank');
    expect(seed).toEqual(expect.objectContaining({
      feedbackType: 'bug',
      title: 'Activity detail is blank',
      description: 'Activity detail is blank',
    }));
    expect(feedbackIntentFromSeed(seed!, 'Activity Detail')).toEqual(expect.objectContaining({
      function: 'draftFeedback',
      arguments: expect.objectContaining({ currentPage: 'Activity Detail' }),
    }));
  });

  it('does not steal normal customer feedback or sales messages', () => {
    expect(detectAppFeedback('The customer gave positive feedback about the demo')).toBeNull();
    expect(detectAppFeedback('Create a follow-up call for tomorrow')).toBeNull();
    expect(detectAppFeedback('这个应用的活动详情不显示客户')).toEqual(expect.objectContaining({ feedbackType: 'bug' }));
  });
});

describe('feedback screenshot assignment', () => {
  it('assigns image attachments to feedback and excludes other files', async () => {
    const intent: IntentResult = {
      function: 'draftFeedback',
      arguments: { title: 'Broken page' },
    } as IntentResult;

    await assignAttachmentsToIntent(intent, [
      { id: 'image-1', name: 'screen.png', mimeType: 'image/png', type: 'image' },
      { id: 'file-1', name: 'notes.pdf', mimeType: 'application/pdf', type: 'file' },
    ], 'This page is broken', 'en-US');

    expect(intent.arguments?.[ATTACHMENT_IDS_KEY]).toEqual(['image-1']);
  });
});

describe('safe feedback diagnostics', () => {
  it('collects coarse device data without identity fields', () => {
    const result = collectSafeFeedbackDiagnostics({
      userAgent: 'Mozilla/5.0 (Linux; Android 10; TAS-AN00 Build/HUAWEI) AppleWebKit/537.36 Chrome/114.0.0.0 Mobile Safari/537.36',
      platform: 'Linux armv8l',
    } as Pick<Navigator, 'userAgent' | 'platform'>);

    expect(result).toEqual({
      device: 'TAS-AN00',
      os: 'Android 10',
      browser: 'Chrome 114.0.0.0',
    });
    expect(Object.keys(result)).toEqual(['device', 'os', 'browser']);
    expect(safeFeedbackPage('Activity Detail')).toBe('Activity Detail');
  });
});

describe('AppFeedbackService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps app fields to Dataverse and reads back a hosted 204 create', async () => {
    const { AppFeedbackService } = await import('@/generated/services/app-feedback-service');
    dataMocks.createRecordAsync.mockResolvedValue({ success: true, data: undefined });
    dataMocks.retrieveMultipleRecordsAsync.mockResolvedValue({
      success: true,
      data: [{
        biz_appfeedbackid: 'feedback-1',
        biz_title: 'Broken page',
        biz_feedbacktype: 'bug',
        biz_description: 'The page is blank',
        biz_appversion: '1.9.0',
        biz_buildid: 'build-1',
        biz_locale: 'en-US',
        biz_source: 'copilot',
        biz_submissionstatus: 'collected',
        biz_clientrequestid: 'request-1',
        biz_submittedon: '2026-07-14T00:00:00Z',
      }],
    });

    const created = await AppFeedbackService.create({
      title: 'Broken page',
      type: 'bug',
      description: 'The page is blank',
      appVersion: '1.9.0',
      buildId: 'build-1',
      locale: 'en-US',
      source: 'copilot',
      status: 'collected',
      clientRequestId: 'request-1',
      submittedOn: '2026-07-14T00:00:00Z',
    });

    expect(dataMocks.createRecordAsync).toHaveBeenCalledWith(
      'biz_appfeedbacks',
      expect.objectContaining({
        biz_title: 'Broken page',
        biz_feedbacktype: 'bug',
        biz_clientrequestid: 'request-1',
      }),
    );
    expect(dataMocks.retrieveMultipleRecordsAsync).toHaveBeenCalledWith(
      'biz_appfeedbacks',
      expect.objectContaining({ filter: "biz_clientrequestid eq 'request-1'" }),
    );
    expect(created.id).toBe('feedback-1');
  });
});
