import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FollowupSection } from '@/lib/change-proposal';

/**
 * Generative preview renderer. Maps the LLM-authored, structured `followup`
 * data (comparison / single / list) to a fixed, vetted set of components so the
 * user can VERIFY the data before confirming. This is the frontend half of the
 * generative-UI contract:
 *   - The reason step decides WHICH sections + WHAT data (dynamic, per intent).
 *   - This renderer owns the layout, from a closed vocabulary (safe).
 * Everything is rendered as escaped text — no HTML/markup from the model.
 * Unknown section kinds are already dropped upstream by sanitizeFollowup.
 */
interface GenerativePreviewProps {
  sections?: FollowupSection[];
}

export function GenerativePreview({ sections }: GenerativePreviewProps) {
  if (!sections || sections.length === 0) return null;
  return (
    <div className="space-y-3 mb-3">
      {sections.map((s, i) => <PreviewSection key={i} section={s} />)}
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <p className="text-xs font-medium text-muted-foreground mb-1.5">{children}</p>;
}

function PreviewSection({ section }: { section: FollowupSection }) {
  if (section.kind === 'comparison') {
    return (
      <div>
        {section.title && <SectionTitle>{section.title}</SectionTitle>}
        <div className="rounded-lg border border-border/60 divide-y divide-border/40 overflow-hidden">
          {section.rows.map((r, i) => {
            const changed = r.before !== r.after;
            return (
              <div key={i} className="px-3 py-2">
                <div className="text-xs text-muted-foreground mb-0.5">{r.field}</div>
                <div className="flex items-start gap-2 flex-wrap text-sm">
                  <span className={cn('text-foreground/70', changed && 'line-through text-muted-foreground')}>{r.before || '—'}</span>
                  {changed && <ArrowRight className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />}
                  {changed && <span className="text-foreground font-medium">{r.after || '—'}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (section.kind === 'single') {
    const danger = section.tone === 'danger';
    return (
      <div>
        {section.title && <SectionTitle>{section.title}</SectionTitle>}
        <div className={cn('rounded-lg border px-3 py-2 space-y-1', danger ? 'border-red-500/40 bg-red-500/5' : 'border-border/60')}>
          {section.rows.map((r, i) => (
            <div key={i} className="flex items-baseline gap-2 text-sm">
              <span className="text-xs text-muted-foreground min-w-16 shrink-0">{r.field}</span>
              <span className={cn('text-foreground', danger && 'line-through text-muted-foreground')}>{r.value || '—'}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // list
  return (
    <div>
      {section.title && <SectionTitle>{section.title}</SectionTitle>}
      <div className="rounded-lg border border-border/60 overflow-x-auto">
        <table className="w-full text-sm">
          {section.columns.length > 0 && (
            <thead>
              <tr className="border-b border-border/40">
                {section.columns.map((c, i) => (
                  <th key={i} className="text-left px-3 py-1.5 text-xs font-medium text-muted-foreground">{c}</th>
                ))}
              </tr>
            </thead>
          )}
          <tbody className="divide-y divide-border/40">
            {section.rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => <td key={j} className="px-3 py-1.5 text-foreground">{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
