import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Unified Markdown renderer for the app (JSX, XSS-safe by React escaping).
 * Supports: H1-H6, bold, italic, strike, inline & fenced code, blockquotes,
 * GFM tables, nested ordered/unordered lists, task list checkboxes,
 * inline links [text](url), autolinks <https://...>, reference-style links
 * `[1]: url "title"` rendered as numbered citation chips, horizontal rules.
 *
 * IMPORTANT: This is the single markdown component for the app. Do NOT
 * reintroduce a parallel renderer. Extend this file instead.
 */
export function MarkdownContent({ content, className }: { content: string; className?: string }) {
  if (!content) return null;

  // Extract reference-style links: [1]: https://url.com "Title"
  const referencePattern = /^\[(\d+)\]:\s*(https?:\/\/[^\s]+)(?:\s+"([^"]+)")?\s*$/gm;
  const references: Map<string, { url: string; title?: string }> = new Map();
  let refMatch: RegExpExecArray | null;
  while ((refMatch = referencePattern.exec(content)) !== null) {
    references.set(refMatch[1], { url: refMatch[2], title: refMatch[3] });
  }
  const cleanedContent = content.replace(referencePattern, '').trim();

  // Inline renderer: handles links, citations, bold, italic, strike, inline code, autolinks
  const renderInline = (text: string): React.ReactNode[] => {
    // Tokenize using a master regex with named alternates.
    // Order matters: code first (eats backticks), then links, autolinks, bold, italic, strike, citations.
    const tokenRe = /(`[^`]+`)|(\[[^\]]+\]\([^)]+\))|(<https?:\/\/[^\s>]+>)|(\*\*[^*]+\*\*|__[^_]+__)|(~~[^~]+~~)|(\*[^*\n]+\*|_[^_\n]+_)|(\[\d+\])/g;
    const out: React.ReactNode[] = [];
    let lastIdx = 0;
    let m: RegExpExecArray | null;
    let key = 0;
    while ((m = tokenRe.exec(text)) !== null) {
      if (m.index > lastIdx) out.push(text.slice(lastIdx, m.index));
      const tok = m[0];
      if (m[1]) {
        out.push(
          <code key={`c-${key++}`} className="bg-muted/50 rounded px-1.5 py-0.5 text-xs font-mono">
            {tok.slice(1, -1)}
          </code>
        );
      } else if (m[2]) {
        const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok);
        if (linkMatch) {
          const url = linkMatch[2];
          out.push(
            <a
              key={`l-${key++}`}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors cursor-pointer"
              onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
                e.preventDefault();
                e.stopPropagation();
                window.open(url, '_blank', 'noopener,noreferrer');
              }}
            >
              {linkMatch[1]}
            </a>
          );
        }
      } else if (m[3]) {
        const url = tok.slice(1, -1);
        out.push(
          <a
            key={`a-${key++}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors cursor-pointer"
            onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
              e.preventDefault();
              e.stopPropagation();
              window.open(url, '_blank', 'noopener,noreferrer');
            }}
          >
            {url}
          </a>
        );
      } else if (m[4]) {
        const inner = tok.startsWith('**') ? tok.slice(2, -2) : tok.slice(2, -2);
        out.push(<strong key={`b-${key++}`} className="font-semibold">{inner}</strong>);
      } else if (m[5]) {
        out.push(<del key={`s-${key++}`} className="text-muted-foreground">{tok.slice(2, -2)}</del>);
      } else if (m[6]) {
        out.push(<em key={`i-${key++}`}>{tok.slice(1, -1)}</em>);
      } else if (m[7]) {
        const num = tok.slice(1, -1);
        const ref = references.get(num);
        if (ref) {
          out.push(
            <a
              key={`cite-${key++}`}
              href={ref.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 mx-0.5 rounded bg-primary/15 text-primary text-[11px] font-semibold hover:bg-primary/25 transition-colors cursor-pointer align-baseline"
              onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
                e.preventDefault();
                e.stopPropagation();
                window.open(ref.url, '_blank', 'noopener,noreferrer');
              }}
              title={ref.title || ref.url}
            >
              {num}
            </a>
          );
        } else {
          out.push(
            <span key={`cite-${key++}`} className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 mx-0.5 rounded bg-muted text-muted-foreground text-[11px] font-semibold align-baseline">
              {num}
            </span>
          );
        }
      }
      lastIdx = m.index + tok.length;
    }
    if (lastIdx < text.length) out.push(text.slice(lastIdx));
    return out;
  };

  // Heading classes by level
  const HEADING_CLS: Record<number, string> = {
    1: 'font-bold text-foreground text-lg mt-4 mb-2',
    2: 'font-semibold text-foreground text-base mt-4 mb-2',
    3: 'font-semibold text-foreground mt-3 mb-2',
    4: 'font-semibold text-foreground text-sm mt-3 mb-1',
    5: 'font-semibold text-foreground text-xs mt-3 mb-1',
    6: 'font-semibold text-foreground text-xs mt-3 mb-1',
  };

  const lines = cleanedContent.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  // Nested list renderer (shared by both bullet and numbered detection paths)
  const renderListGroup = (
    items: { indent: number; type: 'ul' | 'ol'; content: string }[],
    startIdx: number,
    parentIndent: number,
    baseKey: string,
  ): { node: React.ReactNode; endIdx: number } => {
    const children: React.ReactNode[] = [];
    let idx = startIdx;
    const groupType = items[startIdx].type;
    while (idx < items.length) {
      const it = items[idx];
      if (it.indent < parentIndent) break;
      if (it.indent > parentIndent && children.length > 0) {
        const { node: sub, endIdx } = renderListGroup(items, idx, it.indent, `${baseKey}-${idx}`);
        const lastIdxLocal = children.length - 1;
        const last = children[lastIdxLocal] as React.ReactElement<{ children: React.ReactNode }>;
        children[lastIdxLocal] = (
          <li key={last.key} className="ml-4 mb-1">
            {last.props.children}
            {sub}
          </li>
        );
        idx = endIdx;
      } else {
        const taskMatch = /^\[( |x|X)\]\s+(.+)$/.exec(it.content);
        const liContent = taskMatch ? (
          <>
            <input type="checkbox" disabled checked={taskMatch[1].toLowerCase() === 'x'} className="mr-1 align-middle" />
            {renderInline(taskMatch[2])}
          </>
        ) : (
          renderInline(it.content)
        );
        children.push(
          <li key={`${baseKey}-li-${idx}`} className="ml-4 mb-1">
            {liContent}
          </li>
        );
        idx++;
      }
    }
    const cls = groupType === 'ol'
      ? 'list-decimal pl-5 mb-2 space-y-1'
      : 'list-disc pl-4 mb-2 space-y-1';
    const node = groupType === 'ol'
      ? <ol key={`${baseKey}-ol`} className={cls}>{children}</ol>
      : <ul key={`${baseKey}-ul`} className={cls}>{children}</ul>;
    return { node, endIdx: idx };
  };

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    // Fenced code block ```
    if (/^```/.test(line.trim())) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing fence
      elements.push(
        <pre key={`pre-${i}`} className="bg-muted/50 rounded-md p-3 my-2 overflow-x-auto text-xs font-mono">
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    // GFM table: current line is header row, next line is separator
    if (/^\|.+\|\s*$/.test(line) && i + 1 < lines.length && /^\|[ :\-|]+\|\s*$/.test(lines[i + 1])) {
      const headers = line.trim().slice(1, -1).split('|').map(c => c.trim());
      i += 2; // consume header + separator
      const bodyRows: string[][] = [];
      while (i < lines.length && /^\|.+\|\s*$/.test(lines[i])) {
        bodyRows.push(lines[i].trim().slice(1, -1).split('|').map(c => c.trim()));
        i++;
      }
      elements.push(
        <div key={`tbl-${i}`} className="my-2 overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                {headers.map((h, hi) => (
                  <th key={hi} className="border border-border px-2 py-1 text-left font-semibold">
                    {renderInline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => (
                    <td key={ci} className="border border-border px-2 py-1 align-top">
                      {renderInline(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Horizontal rule
    if (/^([-*_]){3,}\s*$/.test(line.trim())) {
      elements.push(<hr key={`hr-${i}`} className="my-4 border-border" />);
      i++;
      continue;
    }

    // Headings H1-H6
    const hMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    if (hMatch) {
      const level = hMatch[1].length;
      const Tag = (`h${level}`) as keyof React.JSX.IntrinsicElements;
      elements.push(
        React.createElement(
          Tag,
          { key: `h-${i}`, className: HEADING_CLS[level] },
          renderInline(hMatch[2]),
        )
      );
      i++;
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      elements.push(
        <blockquote key={`bq-${i}`} className="border-l-2 border-primary/50 pl-3 my-2 text-muted-foreground italic">
          {renderInline(quoteLines.join(' '))}
        </blockquote>
      );
      continue;
    }

    // Lists: detect contiguous block of ul (- *) or ol (1. 1) 1]) items
    const listLineRe = /^(\s*)(?:([-*])|(\d+)[.)\]])\s+(.*)$/;
    if (listLineRe.test(line)) {
      const items: { indent: number; type: 'ul' | 'ol'; content: string }[] = [];
      const baseIndent = (listLineRe.exec(line)![1] || '').length;
      while (i < lines.length) {
        const cur = lines[i];
        const lm = listLineRe.exec(cur);
        if (lm) {
          items.push({
            indent: lm[1].length,
            type: lm[2] ? 'ul' : 'ol',
            content: lm[4],
          });
          i++;
        } else if (cur.trim() === '') {
          const nextNonEmpty = lines.slice(i + 1).find((l: string) => l.trim() !== '');
          if (nextNonEmpty && listLineRe.test(nextNonEmpty)) {
            i++;
            continue;
          } else {
            break;
          }
        } else {
          break;
        }
      }
      const { node } = renderListGroup(items, 0, baseIndent, `lst-${elements.length}`);
      elements.push(node);
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={`p-${i}`} className="mb-1 last:mb-0">
        {renderInline(line)}
      </p>
    );
    i++;
  }

  // Reference link footer
  const referenceElements: React.ReactNode[] = [];
  references.forEach((ref, key) => {
    referenceElements.push(
      <a
        key={`ref-${key}`}
        href={ref.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors cursor-pointer py-0.5"
        onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
          e.preventDefault();
          e.stopPropagation();
          window.open(ref.url, '_blank', 'noopener,noreferrer');
        }}
      >
        <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-primary/10 text-[10px] font-medium">{key}</span>
        <span className="underline underline-offset-2 truncate max-w-[250px]">{ref.title || ref.url}</span>
      </a>
    );
  });

  return (
    <div className={cn('markdown-content', className)}>
      {elements}
      {referenceElements.length > 0 && (
        <div className="mt-3 pt-2 border-t border-border/30 space-y-1">
          <p className="text-[10px] text-muted-foreground mb-1">References:</p>
          {referenceElements}
        </div>
      )}
    </div>
  );
}
