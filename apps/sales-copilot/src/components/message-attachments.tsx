/**
 * Inline attachment preview for chat user messages.
 *
 * Resolves attachment blobs from the in-session store by id. Renders a single
 * thumbnail, or a horizontally swipeable strip for multiple files. Tapping an
 * image opens a full-screen lightbox; tapping a non-image file opens it in a
 * new tab. When blobs are no longer in memory (e.g. after a page reload), falls
 * back to a compact file-name chip so history still reads sensibly.
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, X } from 'lucide-react';
import { getAttachment, type AttachmentMeta } from '@/lib/attachments';

interface MessageAttachmentsProps {
  attachments: AttachmentMeta[];
}

export function MessageAttachments({ attachments }: MessageAttachmentsProps) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  if (!attachments?.length) return null;

  const openFile = (meta: AttachmentMeta) => {
    const blob = getAttachment(meta.id);
    if (!blob) return;
    if (meta.type === 'image') {
      setLightboxUrl(blob.dataUrl);
    } else {
      // Open/download non-image files in a new tab.
      const w = window.open();
      if (w) w.document.write(
        `<iframe src="${blob.dataUrl}" style="border:0;width:100vw;height:100vh"></iframe>`
      );
    }
  };

  const Tile = ({ meta }: { meta: AttachmentMeta }) => {
    const blob = getAttachment(meta.id);
    return (
      <button
        type="button"
        onClick={() => openFile(meta)}
        className="relative shrink-0 w-20 h-20 rounded-lg overflow-hidden border border-primary/30 bg-muted/40 snap-start focus:outline-none focus:ring-2 focus:ring-primary/40"
        title={meta.name}
        aria-label={meta.name}
      >
        {meta.type === 'image' && blob ? (
          <img src={blob.dataUrl} alt={meta.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center px-1">
            <FileText className="w-5 h-5 text-muted-foreground" />
            <span className="text-[8px] text-muted-foreground mt-1 truncate max-w-full">
              {meta.name.length > 10 ? meta.name.slice(0, 10) + '…' : meta.name}
            </span>
          </div>
        )}
      </button>
    );
  };

  return (
    <>
      <div
        className="mt-1.5 flex gap-2 overflow-x-auto snap-x snap-mandatory pb-1 -mx-0.5 px-0.5 scrollbar-thin"
      >
        {attachments.map((meta) => (
          <Tile key={meta.id} meta={meta} />
        ))}
      </div>

      {lightboxUrl && createPortal(
        <div
          className="fixed inset-0 z-[200] bg-black/85 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
          <img
            src={lightboxUrl}
            alt=""
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>,
        document.body
      )}
    </>
  );
}
