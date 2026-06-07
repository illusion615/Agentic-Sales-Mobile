/**
 * Attachment plumbing — carries composer files through the Copilot pipeline and
 * uploads them to Dataverse as ActivityMimeAttachment bound to a created activity.
 * Using activitymimeattachment (not annotation/Notes) so files surface in the
 * native model-driven activity "Attachments" subgrid.
 *
 * Flow: composer (base64) -> ChatMessage / turn store -> agent assigns ids per
 * activity intent -> form-card confirm uploads the assigned files as attachments.
 */
import { ActivitymimeattachmentsService } from '@/generated/services/ActivitymimeattachmentsService';
import type { ActivitymimeattachmentsBase } from '@/generated/models/ActivitymimeattachmentsModel';
import type { ActivityType } from '@/generated/models/activity-model';

/** A file attached in the Copilot composer, carried as a base64 data URL. */
export interface CopilotAttachment {
  /** Stable id used to map attachments to intents across the pipeline. */
  id: string;
  /** Original file name (used as the note subject + filename). */
  name: string;
  /** MIME type, e.g. image/jpeg, application/pdf. */
  mimeType: string;
  /** Full base64 data URL (data:<mime>;base64,<payload>) — preview + upload source. */
  dataUrl: string;
  /** Coarse kind for UI rendering. */
  type: 'image' | 'file';
}

/**
 * Lightweight, persistable attachment descriptor stored on a ChatMessage.
 * Excludes the base64 `dataUrl` so chat history never bloats localStorage —
 * the heavy blob lives only in the in-memory turn store below.
 */
export interface AttachmentMeta {
  id: string;
  name: string;
  mimeType: string;
  type: 'image' | 'file';
}

/** Project a full attachment down to its persistable metadata. */
export function toAttachmentMeta(att: CopilotAttachment): AttachmentMeta {
  return { id: att.id, name: att.name, mimeType: att.mimeType, type: att.type };
}

/**
 * In-memory, session-scoped store of attachment blobs keyed by id. Messages and
 * intents carry only ids; thumbnails (in-session) and uploads resolve blobs here.
 * Not persisted — base64 photos would quickly exceed the localStorage quota.
 */
const attachmentStore = new Map<string, CopilotAttachment>();

/** Register attachment blobs for later lookup by id. */
export function putAttachments(atts: CopilotAttachment[]): void {
  for (const a of atts) attachmentStore.set(a.id, a);
}

/** Resolve attachment blobs by id (missing ids are skipped). */
export function getAttachments(ids: string[] | undefined): CopilotAttachment[] {
  if (!ids?.length) return [];
  const out: CopilotAttachment[] = [];
  for (const id of ids) {
    const a = attachmentStore.get(id);
    if (a) out.push(a);
  }
  return out;
}

/** Resolve a single attachment blob by id (for in-session thumbnails). */
export function getAttachment(id: string): CopilotAttachment | undefined {
  return attachmentStore.get(id);
}

/** Drop blobs once they've been uploaded (frees memory). */
export function dropAttachments(ids: string[] | undefined): void {
  if (!ids?.length) return;
  for (const id of ids) attachmentStore.delete(id);
}

/** Map an activity type to its native Dataverse table for the polymorphic objectid bind. */
const ACTIVITY_ATTACHMENT_TARGET: Record<ActivityType, { logicalName: string; entitySet: string }> = {
  visit: { logicalName: 'appointment', entitySet: 'appointments' },
  meeting: { logicalName: 'appointment', entitySet: 'appointments' },
  call: { logicalName: 'phonecall', entitySet: 'phonecalls' },
  email: { logicalName: 'email', entitySet: 'emails' },
};

/** Strip the `data:<mime>;base64,` prefix; Dataverse `body` wants raw base64. */
function toDocumentBody(dataUrl: string): string {
  const marker = 'base64,';
  const i = dataUrl.indexOf(marker);
  return i >= 0 ? dataUrl.slice(i + marker.length) : dataUrl;
}

/** Rebuild a data URL from a stored attachment's mimetype + raw base64 body. */
function toDataUrl(mimeType: string | undefined, body: string): string {
  return `data:${mimeType || 'application/octet-stream'};base64,${body}`;
}

/** A saved attachment read back from Dataverse. */
export interface SavedAttachment {
  id: string;
  name: string;
  mimeType: string;
  type: 'image' | 'file';
  dataUrl: string;
}

/**
 * Fetch ActivityMimeAttachments bound to an activity, newest first. Returns []
 * on any error so callers can render nothing gracefully.
 *
 * Two-phase: the large `body` (base64 file) column is typically NOT returned by
 * Dataverse list queries (retrieveMultiple), so we list ids + metadata first,
 * then retrieve each record singly to pull its `body`.
 */
export async function fetchActivityAttachments(activityId: string): Promise<SavedAttachment[]> {
  if (!activityId) return [];
  try {
    const list = await ActivitymimeattachmentsService.getAll({
      filter: `_objectid_value eq ${activityId} or _activityid_value eq ${activityId}`,
      select: ['activitymimeattachmentid', 'filename', 'subject', 'mimetype'],
      top: 50,
    });
    console.log('[attachments] list result', { activityId, success: list.success, count: list.data?.length, error: list.error });
    if (!list.success || !list.data?.length) return [];

    const out: SavedAttachment[] = [];
    for (const row of list.data) {
      const id = row.activitymimeattachmentid;
      const name = row.filename || row.subject || 'attachment';
      const mimeType = row.mimetype || 'application/octet-stream';
      // List queries omit the large `body` column — fetch it per record.
      let body = row.body;
      if (!body) {
        try {
          const full = await ActivitymimeattachmentsService.get(id, { select: ['body', 'mimetype', 'filename'] });
          body = full.success ? full.data?.body : undefined;
        } catch (e) {
          console.warn('[attachments] get body failed', id, e);
        }
      }
      if (!body) continue;
      out.push({
        id,
        name,
        mimeType,
        type: mimeType.startsWith('image/') ? 'image' as const : 'file' as const,
        dataUrl: toDataUrl(mimeType, body),
      });
    }
    return out;
  } catch (e) {
    console.warn('[attachments] fetchActivityAttachments failed', e);
    return [];
  }
}

/** Build a fresh attachment id. */
export function newAttachmentId(): string {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Upload attachments as ActivityMimeAttachment bound to a freshly-created
 * activity. Uses the type-specific polymorphic bind
 * (`objectid_<logicalname>@odata.bind`) plus `objecttypecode`, so the files show
 * in the native model-driven activity "Attachments" subgrid. Never throws —
 * failures are counted and logged so a bad file can't break activity creation.
 */
export async function uploadAttachmentsToActivity(
  activityId: string,
  activityType: ActivityType,
  attachments: CopilotAttachment[],
): Promise<{ uploaded: number; failed: number }> {
  if (!activityId || !attachments.length) return { uploaded: 0, failed: 0 };
  const target = ACTIVITY_ATTACHMENT_TARGET[activityType] ?? ACTIVITY_ATTACHMENT_TARGET.visit;

  let uploaded = 0;
  let failed = 0;
  for (const att of attachments) {
    try {
      const bindKey = `objectid_${target.logicalName}@odata.bind`;
      const payload: Record<string, unknown> = {
        subject: att.name,
        filename: att.name,
        mimetype: att.mimeType || 'application/octet-stream',
        body: toDocumentBody(att.dataUrl),
        objecttypecode: target.logicalName,
        [bindKey]: `/${target.entitySet}(${activityId})`,
      };
      console.log('[attachments] creating attachment', { name: att.name, bindKey, target: `/${target.entitySet}(${activityId})`, bytes: (payload.body as string)?.length });
      const res = await ActivitymimeattachmentsService.create(payload as unknown as Omit<ActivitymimeattachmentsBase, 'activitymimeattachmentid'>);
      if (res.success) {
        uploaded++;
        console.log('[attachments] attachment created OK', att.name, res.data);
      } else {
        failed++;
        console.error('[attachments] attachment create failed', att.name, res.error);
      }
    } catch (e) {
      failed++;
      console.error('[attachments] attachment create threw', att.name, e);
    }
  }
  return { uploaded, failed };
}
