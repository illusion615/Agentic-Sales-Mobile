import { AnnotationsService } from '@/generated/services/AnnotationsService';
import type { CopilotAttachment, SavedAttachment } from '@/lib/attachments';

const FEEDBACK_ENTITY_LOGICAL_NAME = 'biz_appfeedback';
const FEEDBACK_ENTITY_SET = 'biz_appfeedbacks';

function toDocumentBody(dataUrl: string): string {
  const marker = 'base64,';
  const index = dataUrl.indexOf(marker);
  return index >= 0 ? dataUrl.slice(index + marker.length) : dataUrl;
}

function toDataUrl(mimeType: string | undefined, body: string): string {
  return `data:${mimeType || 'application/octet-stream'};base64,${body}`;
}

/** Upload image-only screenshots as Notes related to one App Feedback row. */
export async function uploadFeedbackScreenshots(
  feedbackId: string,
  attachments: CopilotAttachment[],
): Promise<{ uploaded: number; failed: number; skipped: number }> {
  const images = attachments.filter((attachment) => attachment.mimeType.startsWith('image/'));
  let uploaded = 0;
  let failed = 0;
  for (const image of images) {
    try {
      const result = await AnnotationsService.create({
        subject: image.name,
        filename: image.name,
        mimetype: image.mimeType,
        documentbody: toDocumentBody(image.dataUrl),
        isdocument: true,
        notetext: 'Screenshot submitted with app feedback',
        [`objectid_${FEEDBACK_ENTITY_LOGICAL_NAME}@odata.bind`]: `/${FEEDBACK_ENTITY_SET}(${feedbackId})`,
      } as never);
      if (result.success) uploaded += 1;
      else failed += 1;
    } catch (error) {
      failed += 1;
      console.error('[feedback] screenshot upload failed', { feedbackId, name: image.name, error });
    }
  }
  return { uploaded, failed, skipped: attachments.length - images.length };
}

export async function fetchFeedbackScreenshots(feedbackId: string): Promise<SavedAttachment[]> {
  if (!feedbackId) return [];
  try {
    const list = await AnnotationsService.getAll({
      filter: `_objectid_value eq ${feedbackId} and isdocument eq true`,
      select: ['annotationid', 'filename', 'subject', 'mimetype', 'documentbody'],
      orderBy: ['createdon desc'],
      top: 20,
    });
    if (!list.success || !list.data) return [];

    const screenshots: SavedAttachment[] = [];
    for (const note of list.data) {
      const mimeType = note.mimetype || 'application/octet-stream';
      if (!mimeType.startsWith('image/')) continue;
      let body = note.documentbody;
      if (!body) {
        const full = await AnnotationsService.get(note.annotationid, { select: ['documentbody', 'mimetype', 'filename'] });
        body = full.success ? full.data?.documentbody : undefined;
      }
      if (!body) continue;
      screenshots.push({
        id: note.annotationid,
        name: note.filename || note.subject || 'screenshot',
        mimeType,
        type: 'image',
        dataUrl: toDataUrl(mimeType, body),
      });
    }
    return screenshots;
  } catch (error) {
    console.warn('[feedback] failed to read screenshots', { feedbackId, error });
    return [];
  }
}
