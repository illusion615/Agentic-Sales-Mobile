import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const dataverse = process.env.DATAVERSE_CLI || join(homedir(), '.hermes/node/bin/dataverse');
if (!existsSync(dataverse)) {
  throw new Error(`Dataverse CLI not found at ${dataverse}. Set DATAVERSE_CLI to its absolute path.`);
}

const clientRequestId = `feedback-smoke-${crypto.randomUUID()}`;
const feedbackTitle = `[SMOKE] Feedback persistence ${clientRequestId.slice(-8)}`;
const noteSubject = `[SMOKE] Screenshot ${clientRequestId.slice(-8)}`;
let feedbackId = '';
let annotationId = '';

function run(args, { json = false } = {}) {
  const result = spawnSync(dataverse, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`dataverse ${args.join(' ')} failed\n${result.stderr || result.stdout}`);
  }
  if (!json) return result.stdout;
  const output = result.stdout.trim();
  const objectStart = output.indexOf('{');
  const arrayStart = output.indexOf('[');
  const starts = [objectStart, arrayStart].filter((index) => index >= 0);
  if (!starts.length) throw new Error(`Dataverse returned no JSON:\n${output}`);
  return JSON.parse(output.slice(Math.min(...starts)));
}

function query(table, select, filter) {
  return run([
    'data', 'query', '--table', table,
    '--select', select,
    '--filter', filter,
    '--top', '10',
    '--json',
  ], { json: true });
}

try {
  const now = new Date().toISOString();
  run([
    'data', 'create', '--table', 'biz_appfeedbacks', '--data', JSON.stringify({
      biz_title: feedbackTitle,
      biz_feedbacktype: 'bug',
      biz_description: 'Automated reversible persistence probe.',
      biz_expectedoutcome: 'The feedback row and screenshot Note can be created and read.',
      biz_appversion: 'smoke',
      biz_buildid: 'feedback-dataverse-smoke',
      biz_locale: 'en-US',
      biz_source: 'manual',
      biz_submissionstatus: 'collected',
      biz_clientrequestid: clientRequestId,
      biz_submittedon: now,
    }), '--json',
  ], { json: true });

  const feedback = query(
    'biz_appfeedbacks',
    'biz_appfeedbackid,biz_title,biz_clientrequestid,_ownerid_value',
    `biz_clientrequestid eq '${clientRequestId}'`,
  ).value?.[0];
  if (!feedback?.biz_appfeedbackid) throw new Error('Created feedback row could not be read back.');
  feedbackId = feedback.biz_appfeedbackid;

  const ownerScoped = query(
    'biz_appfeedbacks',
    'biz_appfeedbackid,biz_clientrequestid',
    `Microsoft.Dynamics.CRM.EqualUserId(PropertyName='ownerid') and biz_clientrequestid eq '${clientRequestId}'`,
  ).value ?? [];
  if (!ownerScoped.some((row) => row.biz_appfeedbackid === feedbackId)) {
    throw new Error('Current-user owner filter did not return the created feedback row.');
  }

  run([
    'data', 'create', '--table', 'annotations', '--data', JSON.stringify({
      subject: noteSubject,
      filename: 'feedback-smoke.png',
      mimetype: 'image/png',
      documentbody: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      isdocument: true,
      notetext: 'Screenshot submitted with app feedback',
      'objectid_biz_appfeedback@odata.bind': `/biz_appfeedbacks(${feedbackId})`,
    }), '--json',
  ], { json: true });

  const note = query(
    'annotations',
    'annotationid,subject,filename,mimetype,_objectid_value',
    `_objectid_value eq ${feedbackId} and subject eq '${noteSubject}'`,
  ).value?.[0];
  if (!note?.annotationid || note._objectid_value !== feedbackId) {
    throw new Error('Screenshot Note was not related to the feedback row.');
  }
  annotationId = note.annotationid;

  console.log(JSON.stringify({
    ok: true,
    checks: ['feedback-create-readback', 'current-user-owner-filter', 'screenshot-note-bind'],
    cleanup: 'pending',
  }));
} finally {
  if (annotationId) {
    run(['data', 'delete', '--table', 'annotations', '--id', annotationId, '--no-confirm', '--json']);
  }
  if (feedbackId) {
    run(['data', 'delete', '--table', 'biz_appfeedbacks', '--id', feedbackId, '--no-confirm', '--json']);
  }

  if (feedbackId) {
    const remainingFeedback = query(
      'biz_appfeedbacks',
      'biz_appfeedbackid',
      `biz_clientrequestid eq '${clientRequestId}'`,
    ).value ?? [];
    if (remainingFeedback.length) throw new Error(`Cleanup failed for feedback ${feedbackId}.`);
  }
  if (annotationId) {
    const remainingNote = query(
      'annotations',
      'annotationid',
      `annotationid eq ${annotationId}`,
    ).value ?? [];
    if (remainingNote.length) throw new Error(`Cleanup failed for annotation ${annotationId}.`);
  }
  if (feedbackId) console.log(JSON.stringify({ ok: true, cleanup: 'verified' }));
}