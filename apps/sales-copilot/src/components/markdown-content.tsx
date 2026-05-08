import React from 'react';

export function MarkdownContent({ content }: { content: string }) {
  if (!content) return null;

  // Extract reference-style links like [1]: https://url.com "Title"
  const referencePattern = /^\[(\d+)\]:\s*(https?:\/\/[^\s]+)(?:\s+"([^"]+)")?\s*$/gm;
  const references: Map<string, { url: string; title?: string }> = new Map();
  let refMatch: RegExpExecArray | null;
  
  while ((refMatch = referencePattern.exec(content)) !== null) {
    references.set(refMatch[1], { url: refMatch[2], title: refMatch[3] });
  }
  
  // Remove reference definitions from content for display
  const cleanedContent = content.replace(referencePattern, '').trim();

  const renderInline = (text: string): React.ReactNode => {
    // Handle inline links [text](url)
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    // Handle citation markers like [1], [2] etc
    const citationRegex = /\[(\d+)\]/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let keyIdx = 0;

    // First pass: handle inline links
    const textWithLinks: (string | React.ReactNode)[] = [];
    let linkLastIndex = 0;
    let linkMatch: RegExpExecArray | null;

    while ((linkMatch = linkRegex.exec(text)) !== null) {
      if (linkMatch.index > linkLastIndex) {
        textWithLinks.push(text.slice(linkLastIndex, linkMatch.index));
      }
      textWithLinks.push(
        <a
          key={`link-${keyIdx++}`}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors cursor-pointer"
          onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
            e.preventDefault();
            e.stopPropagation();
            window.open(linkMatch![2], '_blank', 'noopener,noreferrer');
          }}
        >
          {linkMatch[1]}
        </a>
      );
      linkLastIndex = linkMatch.index + linkMatch[0].length;
    }
    if (linkLastIndex < text.length) {
      textWithLinks.push(text.slice(linkLastIndex));
    }

    // Second pass: handle citations and bold in remaining text parts
    textWithLinks.forEach((part: string | React.ReactNode, partIdx: number) => {
      if (typeof part !== 'string') {
        parts.push(part);
        return;
      }

      // Process citations in text
      let citationLastIndex = 0;
      let citationMatch: RegExpExecArray | null;
      const citationParts: (string | React.ReactNode)[] = [];
      
      while ((citationMatch = citationRegex.exec(part)) !== null) {
        const citationNum = citationMatch[1];
        const ref = references.get(citationNum);
        
        if (citationMatch.index > citationLastIndex) {
          citationParts.push(part.slice(citationLastIndex, citationMatch.index));
        }
        
        if (ref) {
          // Citation has a matching reference - make it a clickable link
          citationParts.push(
            <a
              key={`cite-${partIdx}-${citationMatch.index}`}
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
              {citationNum}
            </a>
          );
        } else {
          // Citation without reference - just highlight it
          citationParts.push(
            <span
              key={`cite-${partIdx}-${citationMatch.index}`}
              className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 mx-0.5 rounded bg-muted text-muted-foreground text-[11px] font-semibold align-baseline"
            >
              {citationNum}
            </span>
          );
        }
        
        citationLastIndex = citationMatch.index + citationMatch[0].length;
      }
      
      if (citationLastIndex < part.length) {
        citationParts.push(part.slice(citationLastIndex));
      }
      
      // If no citations found, use original part
      const partsToProcess = citationParts.length > 0 ? citationParts : [part];
      
      // Third pass: handle bold in text parts
      partsToProcess.forEach((subPart: string | React.ReactNode, subIdx: number) => {
        if (typeof subPart !== 'string') {
          parts.push(subPart);
          return;
        }
        
        const boldParts = subPart.split(/(\*\*[^*]+\*\*)/g);
        if (boldParts.length > 1) {
          boldParts.forEach((bp: string, bpIdx: number) => {
            if (bp.startsWith('**') && bp.endsWith('**')) {
              parts.push(<strong key={`bold-${partIdx}-${subIdx}-${bpIdx}`} className="font-semibold">{bp.slice(2, -2)}</strong>);
            } else if (bp) {
              parts.push(bp);
            }
          });
        } else if (subPart) {
          parts.push(subPart);
        }
      });
    });

    return parts;
  };

  const lines = cleanedContent.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    
    // Skip empty lines
    if (!line.trim()) { 
      i++; 
      continue; 
    }
    
    // Check if this is a bullet list item (- or * followed by space)
    const bulletMatch = line.match(/^(\s*)([-*])\s+(.*)$/);
    if (bulletMatch) {
      // Collect all consecutive bullet items at this level or deeper
      const listItems: { indent: number; content: string }[] = [];
      const baseIndent = bulletMatch[1].length;
      
      while (i < lines.length) {
        const currentLine = lines[i];
        const currentBulletMatch = currentLine.match(/^(\s*)([-*])\s+(.*)$/);
        
        if (currentBulletMatch) {
          const currentIndent = currentBulletMatch[1].length;
          listItems.push({
            indent: currentIndent,
            content: currentBulletMatch[3]
          });
          i++;
        } else if (currentLine.trim() === '') {
          // Empty line - check if list continues after
          const nextNonEmpty = lines.slice(i + 1).find((l: string) => l.trim() !== '');
          if (nextNonEmpty && /^\s*[-*]\s+/.test(nextNonEmpty)) {
            i++;
            continue;
          } else {
            break;
          }
        } else {
          break;
        }
      }
      
      // Render nested list structure
      const renderList = (items: { indent: number; content: string }[], startIdx: number, parentIndent: number): { element: React.ReactNode; endIdx: number } => {
        const listElements: React.ReactNode[] = [];
        let idx = startIdx;
        
        while (idx < items.length) {
          const item = items[idx];
          
          if (item.indent < parentIndent) {
            // This item belongs to a parent list
            break;
          } else if (item.indent > parentIndent && listElements.length > 0) {
            // This is a nested item - create a sublist
            const { element: subList, endIdx } = renderList(items, idx, item.indent);
            // Append sublist to last item
            const lastIdx = listElements.length - 1;
            const lastItem = listElements[lastIdx] as React.ReactElement<{ children: React.ReactNode }>;
            listElements[lastIdx] = (
              <li key={lastItem.key} className="ml-4 mb-1">
                {lastItem.props.children}
                {subList}
              </li>
            );
            idx = endIdx;
          } else {
            // Same level item
            listElements.push(
              <li key={`li-${elements.length}-${idx}`} className="ml-4 mb-1">
                {renderInline(item.content)}
              </li>
            );
            idx++;
          }
        }
        
        return {
          element: <ul key={`ul-${elements.length}`} className="list-disc pl-4 mb-2 space-y-1">{listElements}</ul>,
          endIdx: idx
        };
      };
      
      const { element } = renderList(listItems, 0, baseIndent);
      elements.push(element);
      continue;
    }
    
    // Check if this is a numbered list item (1. or 1) followed by space)
    const numberedMatch = line.match(/^(\s*)(\d+)[.)\]]\s+(.*)$/);
    if (numberedMatch) {
      // Collect all consecutive numbered items
      const listItems: { indent: number; content: string }[] = [];
      const baseIndent = numberedMatch[1].length;
      
      while (i < lines.length) {
        const currentLine = lines[i];
        const currentNumberedMatch = currentLine.match(/^(\s*)(\d+)[.)\]]\s+(.*)$/);
        
        if (currentNumberedMatch) {
          const currentIndent = currentNumberedMatch[1].length;
          listItems.push({
            indent: currentIndent,
            content: currentNumberedMatch[3]
          });
          i++;
        } else if (currentLine.trim() === '') {
          const nextNonEmpty = lines.slice(i + 1).find((l: string) => l.trim() !== '');
          if (nextNonEmpty && /^\s*\d+[.)\]]\s+/.test(nextNonEmpty)) {
            i++;
            continue;
          } else {
            break;
          }
        } else {
          break;
        }
      }
      
      // Render numbered list
      const olElements = listItems.map((item: { indent: number; content: string }, idx: number) => (
        <li key={`oli-${elements.length}-${idx}`} className="ml-4 mb-1">
          {renderInline(item.content)}
        </li>
      ));
      
      elements.push(
        <ol key={`ol-${elements.length}`} className="list-decimal pl-4 mb-2 space-y-1">
          {olElements}
        </ol>
      );
      continue;
    }
    
    // Regular paragraph
    elements.push(<p key={`p-${i}`} className="mb-1 last:mb-0">{renderInline(line)}</p>);
    i++;
  }

  // Render reference links at the bottom if any exist
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
    <div className="markdown-content">
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
