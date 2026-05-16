import { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * Lightweight Markdown renderer for AI-generated content.
 * Supports: headings, bold, italic, lists, code blocks, inline code, links, blockquotes
 */
export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const html = useMemo(() => parseMarkdown(content), [content]);
  
  return (
    <div 
      className={cn('markdown-content', className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function parseMarkdown(text: string): string {
  if (!text) return '';
  
  let html = text;
  
  // Escape HTML to prevent XSS
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  // Code blocks (```)
  html = html.replace(
    /```([\s\S]*?)```/g,
    '<pre class="bg-muted/50 rounded-md p-3 my-2 overflow-x-auto text-xs font-mono"><code>$1</code></pre>'
  );
  
  // Inline code (`)
  html = html.replace(
    /`([^`]+)`/g,
    '<code class="bg-muted/50 rounded px-1.5 py-0.5 text-xs font-mono">$1</code>'
  );
  
  // Headings (### ## #)
  html = html.replace(/^### (.+)$/gm, '<h3 class="font-semibold text-foreground mt-4 mb-2">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="font-semibold text-foreground text-base mt-4 mb-2">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="font-bold text-foreground text-lg mt-4 mb-2">$1</h1>');
  
  // Bold (**text** or __text__)
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong class="font-semibold text-foreground">$1</strong>');
  
  // Italic (*text* or _text_)
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
  
  // Strikethrough (~~text~~)
  html = html.replace(/~~([^~]+)~~/g, '<del class="text-muted-foreground">$1</del>');
  
  // Blockquotes (> text)
  html = html.replace(
    /^&gt; (.+)$/gm,
    '<blockquote class="border-l-2 border-primary/50 pl-3 my-2 text-muted-foreground italic">$1</blockquote>'
  );
  
  // Unordered lists (- or *)
  html = html.replace(
    /^[\-\*] (.+)$/gm,
    '<li class="ml-4 pl-1">$1</li>'
  );
  
  // Ordered lists (1. 2. 3.)
  html = html.replace(
    /^(\d+)\. (.+)$/gm,
    '<li class="ml-4 pl-1">$2</li>'
  );
  
  // Wrap consecutive list items in proper ul/ol
  html = html.replace(
    /(<li[^>]*>.*<\/li>\n?)+/g,
    (match: string) => `<ul class="my-2 space-y-1 list-disc list-outside pl-4">${match}</ul>`
  );
  
  // Links [text](url)
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" class="text-primary hover:underline" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  
  // Horizontal rules (--- or ***)
  html = html.replace(/^(\-{3,}|\*{3,})$/gm, '<hr class="my-4 border-border" />');
  
  // Line breaks - convert double newlines to paragraphs
  const paragraphs = html.split(/\n\n+/);
  html = paragraphs
    .map((p: string) => {
      // Skip if already wrapped in a block element
      if (/^<(h[1-6]|pre|ul|ol|blockquote|hr)/i.test(p.trim())) {
        return p;
      }
      // Wrap plain text in paragraph
      if (p.trim()) {
        return `<p class="mb-2">${p.replace(/\n/g, '<br />')}</p>`;
      }
      return '';
    })
    .join('');
  
  return html;
}
