import { describe, expect, it } from 'vitest';
import { buildBriefingPrompt, parseBriefingResponse } from '@/domain/briefing-contract';
import { buildVisitSummaryPrompt, parseVisitSummaryResponse } from '@/domain/visit-summary-contract';
import { cleanList, extractJsonObject } from '@/domain/model-response';
import type { CustomerProfile, ServiceHistoryEntry } from '@/domain/customer';
import type { FormSchema } from '@/domain/form-schema';
import type { WorkOrderDetail } from '@/domain/work-order';

const customer: CustomerProfile = {
  id: 'acc-1',
  name: '南山人民医院',
  siteAccessNotes: '设备科在住院楼 B1，需登记。',
  cautions: ['血透室为洁净区'],
  contacts: [{ name: '王主任', role: '设备科主任', phone: '13800000001' }],
};

const workOrder = {
  number: 'WO-1001',
  customerName: '南山人民医院',
  incidentType: '透析机停机',
  assetName: '透析机 DX-200 #3',
  summary: '血液透析机报警停机。',
} as WorkOrderDetail;

const history: ServiceHistoryEntry[] = [
  {
    id: 'h1',
    workOrderNumber: 'WO-0900',
    completedOn: '2026-07-11T02:00:00Z',
    incidentType: '透析机停机',
    resolution: '更换电导率传感器，校准后正常。',
  },
];

describe('model-response gate', () => {
  it('finds the object inside a fenced reply', () => {
    expect(extractJsonObject('前言\n```json\n{"a":1}\n```\n后记')).toBe('{"a":1}');
  });

  it('returns null when there is no object at all', () => {
    expect(extractJsonObject('抱歉，我无法回答。')).toBeNull();
  });

  it('trims, de-duplicates and caps a list', () => {
    expect(cleanList([' a ', 'a', '', 'b', 'c'], 2)).toEqual(['a', 'b']);
  });

  it('takes a bare string as a list of one', () => {
    expect(cleanList('只有一条', 3)).toEqual(['只有一条']);
  });

  it('treats a non-list as nothing rather than guessing', () => {
    expect(cleanList({ a: 1 }, 3)).toEqual([]);
  });
});

describe('briefing contract', () => {
  it('gives the model the history it must ground the briefing in', () => {
    const prompt = buildBriefingPrompt({ workOrder, customer, history });
    expect(prompt).toContain('2026-07-11 透析机停机: 更换电导率传感器，校准后正常。');
    expect(prompt).toContain('设备科在住院楼 B1，需登记。');
    expect(prompt).toContain('王主任(设备科主任) 13800000001');
  });

  it('says plainly there is no history rather than omitting the section', () => {
    expect(buildBriefingPrompt({ workOrder, customer, history: [] })).toContain('(none)');
  });

  it('accepts a well-formed briefing', () => {
    const raw = '{"background":"背景","watchOuts":["洁净区"],"preparation":["带备件"]}';
    expect(parseBriefingResponse(raw).briefing).toEqual({
      background: '背景',
      watchOuts: ['洁净区'],
      preparation: ['带备件'],
    });
  });

  it('accepts a briefing with no lists — empty is a valid answer', () => {
    const { briefing } = parseBriefingResponse('{"background":"背景"}');
    expect(briefing).toEqual({ background: '背景', watchOuts: [], preparation: [] });
  });

  it('refuses a briefing with no background instead of showing an empty card', () => {
    const { briefing, problem } = parseBriefingResponse('{"watchOuts":["x"]}');
    expect(briefing).toBeNull();
    expect(problem).toContain('背景');
  });

  it('reports rather than throws when the reply is not JSON', () => {
    expect(parseBriefingResponse('AI 服务不可用').briefing).toBeNull();
  });
});

const schema: FormSchema = {
  id: 'f@1',
  title: '透析机维修单',
  sections: [
    {
      key: 's1',
      title: '故障',
      fields: [
        { name: 'a', label: '1、报警现象描述：', type: 'textarea', required: true, readonly: false },
        {
          name: 'b',
          label: '2、故障归类：',
          type: 'single-select',
          required: true,
          readonly: false,
          options: [{ key: 'sensor', label: '传感器' }],
        },
        { name: 'c', label: '备注', type: 'textarea', required: false, readonly: false },
      ],
    },
  ],
};

describe('visit summary contract', () => {
  const prompt = buildVisitSummaryPrompt({
    workOrder,
    schema,
    values: [
      { name: 'a', value: '电导率报警', source: 'user' },
      { name: 'b', value: 'sensor', source: 'user' },
    ],
  });

  it('shows the answer in words, not the stored option key', () => {
    expect(prompt).toContain('故障归类：传感器');
    expect(prompt).not.toContain('sensor');
  });

  it('leaves unanswered fields out so a blank cannot read as a finding', () => {
    expect(prompt).not.toContain('备注');
  });

  it('accepts a well-formed summary and caps the highlights', () => {
    const raw = '{"text":"摘要","highlights":["1","2","3","4","5"]}';
    const { summary } = parseVisitSummaryResponse(raw);
    expect(summary?.text).toBe('摘要');
    expect(summary?.highlights).toHaveLength(4);
  });

  it('refuses an empty summary instead of showing a blank card', () => {
    const { summary, problem } = parseVisitSummaryResponse('{"text":"   "}');
    expect(summary).toBeNull();
    expect(problem).toContain('摘要');
  });
});
