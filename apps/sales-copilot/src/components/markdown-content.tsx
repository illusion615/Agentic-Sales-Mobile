import React from 'react';
import Markdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { cn } from '@/lib/utils';

/**
 * Unified Markdown renderer for the whole app.
 *
 * Built on the CommonMark + GFM standard (react-markdown + remark-gfm), so any
 * well-formed Markdown renders correctly: headings, emphasis, nested & loose lists
 * (including multi-paragraph items), task lists, tables with alignment, fenced &
 * inline code, blockquotes, images, autolinks and footnotes. Raw HTML is escaped
 * and URLs are sanitized (react-markdown's defaultUrlTransform + rehype-sanitize),
 * so it is safe to render untrusted LLM output.
 *
 * The only app-specific behaviour is numeric citations: a link-reference
 * definition `[1]: https://... "Title"` lets an inline `[1]` render as a compact
 * citation chip, and all such definitions are collected into a References footer.
 *
 * SINGLE SOURCE OF TRUTH: this is the ONLY Markdown renderer in the app. Never
 * hand-roll another parser or a one-off regex formatter — render Markdown through
 * this component and extend it here (add a remark/rehype plugin for anything
 * structural) so every surface stays consistent, standard-compliant and safe.
 */

/** Flatten arbitrary React children into plain text (used for citation detection). */
function childText(children: React.ReactNode): string {
  if (children == null || typeof children === 'boolean') return '';
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(childText).join('');
  if (React.isValidElement(children)) {
    return childText((children.props as { children?: React.ReactNode }).children);
  }
  return '';
}

/** Only http(s)/mailto/tel targets are opened in a new tab; anything else is inert. */
function isExternalHref(url: string): boolean {
  return /^(https?:|mailto:|tel:)/i.test(url);
}

// Safe sanitize schema: start from the GitHub default (escapes HTML, drops unsafe
// URL schemes), then re-allow only what GFM legitimately produces — language
// classes on code and alignment on table cells. Raw HTML never reaches the tree,
// so these additions cannot be abused.
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), 'className'],
    span: [...(defaultSchema.attributes?.span ?? []), 'className'],
    th: [...(defaultSchema.attributes?.th ?? []), 'style', 'align'],
    td: [...(defaultSchema.attributes?.td ?? []), 'style', 'align'],
  },
};

const HEADING_CLS: Record<string, string> = {
  h1: 'font-bold text-foreground text-lg mt-4 mb-2 first:mt-0',
  h2: 'font-semibold text-foreground text-base mt-4 mb-2 first:mt-0',
  h3: 'font-semibold text-foreground mt-3 mb-2 first:mt-0',
  h4: 'font-semibold text-foreground text-sm mt-3 mb-1 first:mt-0',
  h5: 'font-semibold text-foreground text-xs mt-3 mb-1 first:mt-0',
  h6: 'font-semibold text-foreground text-xs mt-3 mb-1 first:mt-0',
};

export function MarkdownContent({ content, className }: { content: string; className?: string }) {
  if (!content) return null;

  // Collect numeric link-reference definitions for the citation chips + footer.
  // They stay in `content` so CommonMark resolves inline `[1]` shortcuts; a
  // definition renders nothing on its own.
  const references = new Map<string, { url: string; title?: string }>();
  const refPattern = /^\[(\d+)\]:\s*(https?:\/\/[^\s]+)(?:\s+"([^"]+)")?\s*$/gm;
  let refMatch: RegExpExecArray | null;
  while ((refMatch = refPattern.exec(content)) !== null) {
    references.set(refMatch[1], { url: refMatch[2], title: refMatch[3] });
  }

  const openExternal = (url: string) => (e: React.MouseEvent) => {
    if (!isExternalHref(url)) return;
    e.preventDefault();
    e.stopPropagation();
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const components: Components = {
    h1: ({ node, ...p }) => <h1 className={HEADING_CLS.h1} {...p} />,
    h2: ({ node, ...p }) => <h2 className={HEADING_CLS.h2} {...p} />,
    h3: ({ node, ...p }) => <h3 className={HEADING_CLS.h3} {...p} />,
    h4: ({ node, ...p }) => <h4 className={HEADING_CLS.h4} {...p} />,
    h5: ({ node, ...p }) => <h5 className={HEADING_CLS.h5} {...p} />,
    h6: ({ node, ...p }) => <h6 className={HEADING_CLS.h6} {...p} />,
    p: ({ node, ...p }) => <p className="mb-2 last:mb-0 leading-relaxed" {...p} />,
    strong: ({ node, ...p }) => <strong className="font-semibold" {...p} />,
    em: ({ node, ...p }) => <em {...p} />,
    del: ({ node, ...p }) => <del className="text-muted-foreground" {...p} />,
    ul: ({ node, ...p }) => <ul className="list-disc pl-5 mb-2 space-y-1" {...p} />,
    ol: ({ node, ...p }) => <ol className="list-decimal pl-5 mb-2 space-y-1" {...p} />,
    li: ({ node, ...p }) => <li className="leading-relaxed" {...p} />,
    hr: ({ node, ...p }) => <hr className="my-4 border-border" {...p} />,
    blockquote: ({ node, ...p }) => (
      <blockquote className="border-l-2 border-primary/50 pl-3 my-2 text-muted-foreground italic" {...p} />
    ),
    pre: ({ node, ...p }) => (
      <pre className="bg-muted/50 rounded-md p-3 my-2 overflow-x-auto text-xs font-mono" {...p} />
    ),
    code: ({ node, className: cls, children, ...p }) => {
      const isBlock = /\blanguage-/.test(cls ?? '') || childText(children).includes('\n');
      if (isBlock) {
        return <code className={cls} {...p}>{children}</code>;
      }
      return (
        <code className="bg-muted/50 rounded px-1.5 py-0.5 text-xs font-mono" {...p}>
          {children}
        </code>
      );
    },
    input: ({ node, ...p }) => <input {...p} className="mr-1 align-middle" readOnly />,
    img: ({ node, ...p }) => (
      // eslint-disable-next-line jsx-a11y/alt-text
      <img className="max-w-full h-auto rounded my-2" loading="lazy" {...p} />
    ),
    table: ({ node, ...p }) => (
      <div className="my-2 overflow-x-auto">
        <table className="w-full border-collapse text-xs" {...p} />
      </div>
    ),
    th: ({ node, className: cls, ...p }) => (
      <th className={cn('border border-border px-2 py-1 text-left font-semibold', cls)} {...p} />
    ),
    td: ({ node, className: cls, ...p }) => (
      <td className={cn('border border-border px-2 py-1 align-top', cls)} {...p} />
    ),
    a: ({ node, href, children, ...p }) => {
      const url = href ?? '';
      const text = childText(children);
      // Numeric citation resolved from a reference definition -> compact chip.
      if (/^\d+$/.test(text) && references.has(text)) {
        const ref = references.get(text)!;
        return (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title={ref.title || url}
            onClick={openExternal(url)}
            className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 mx-0.5 rounded bg-primary/15 text-primary text-[11px] font-semibold no-underline hover:bg-primary/25 transition-colors cursor-pointer align-baseline"
          >
            {text}
          </a>
        );
      }
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={openExternal(url)}
          className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors cursor-pointer break-words"
          {...p}
        >
          {children}
        </a>
      );
    },
  };

  const referenceEntries = [...references.entries()];

  return (
    <div className={cn('markdown-content', className)}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
        components={components}
      >
        {content}
      </Markdown>
      {referenceEntries.length > 0 && (
        <div className="mt-3 pt-2 border-t border-border/30 space-y-1">
          <p className="text-[10px] text-muted-foreground mb-1">References:</p>
          {referenceEntries.map(([key, ref]) => (
            <a
              key={`ref-${key}`}
              href={ref.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={openExternal(ref.url)}
              className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors cursor-pointer py-0.5"
            >
              <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-primary/10 text-[10px] font-medium">{key}</span>
              <span className="underline underline-offset-2 truncate max-w-[250px]">{ref.title || ref.url}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
