import { describe, expect, it } from 'vitest';
import { captureProgress } from '@/domain/capture-progress';
import type { FieldValue, FormSchema } from '@/domain/form-schema';

const schema: FormSchema = {
  id: 'f@1',
  title: '透析机维修单',
  sections: [
    {
      key: 's1',
      title: '故障判断',
      fields: [
        { name: 'a', label: '1、报警现象描述：', type: 'textarea', required: true, readonly: false },
        { name: 'b', label: '2、故障归类：', type: 'single-select', required: true, readonly: false },
        { name: 'c', label: '3、是否已恢复运行：', type: 'single-select', required: true, readonly: false },
        { name: 'd', label: '备注', type: 'textarea', required: false, readonly: false },
      ],
    },
  ],
};

const job = { assetName: '透析机 DX-200 #3', incidentType: '透析机停机' };
const answer = (name: string): FieldValue => ({ name, value: 'x', source: 'user' });

describe('captureProgress', () => {
  it('opens by asking about the equipment, not by reporting a score', () => {
    const progress = captureProgress(job, schema, []);
    expect(progress.stage).toBe('blank');
    expect(progress.headline).toContain('透析机 DX-200 #3');
    expect(progress.headline).not.toMatch(/0\/3/);
  });

  it('falls back to the fault when no equipment is named', () => {
    const progress = captureProgress({ incidentType: '监护仪校准' }, schema, []);
    expect(progress.headline).toContain('监护仪校准');
  });

  it('stays generic rather than inventing a subject', () => {
    const progress = captureProgress({}, schema, []);
    expect(progress.headline).toContain('本次服务');
  });

  it('names every outstanding question once few enough remain', () => {
    const progress = captureProgress(job, schema, [answer('a')]);
    expect(progress.stage).toBe('nearly');
    expect(progress.headline).toBe('还差故障归类、是否已恢复运行，就能提交了');
  });

  it('counts rather than lists while many remain', () => {
    const wide: FormSchema = {
      ...schema,
      sections: [
        {
          ...schema.sections[0],
          fields: [
            ...schema.sections[0].fields,
            { name: 'e', label: '4、更换备件：', type: 'textarea', required: true, readonly: false },
          ],
        },
      ],
    };
    const progress = captureProgress(job, wide, [answer('e')]);
    expect(progress.stage).toBe('gathering');
    expect(progress.headline).toBe('透析机 DX-200 #3还差 3 项：报警现象描述、故障归类 等');
  });

  it('strips authoring ornaments from the questions it quotes', () => {
    const progress = captureProgress(job, schema, [answer('a'), answer('b')]);
    expect(progress.missing).toEqual(['是否已恢复运行']);
  });

  it('reports ready only once every required question is answered', () => {
    const progress = captureProgress(job, schema, [answer('a'), answer('b'), answer('c')]);
    expect(progress.stage).toBe('ready');
    expect(progress.submittable).toBe(true);
    expect(progress.percent).toBe(100);
  });

  it('does not let an optional field hold up submission', () => {
    const progress = captureProgress(job, schema, [answer('a'), answer('b'), answer('c')]);
    expect(progress.missing).toEqual([]);
  });
});
