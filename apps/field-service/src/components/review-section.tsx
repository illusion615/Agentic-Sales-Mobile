import type { FieldValue, FormValue } from '@/domain/form-schema';
import type { SectionReview, SectionStatus } from '@/domain/review';
import { FormFieldRow, type FormContext } from './form-field';

const TONE: Record<SectionStatus, { dot: string; text: string; ring: string }> = {
  'needs-input': { dot: 'bg-amber-500', text: 'text-amber-700', ring: 'ring-amber-200' },
  'needs-review': { dot: 'bg-primary', text: 'text-primary', ring: 'ring-primary/30' },
  settled: { dot: 'bg-emerald-500', text: 'text-emerald-600', ring: 'ring-transparent' },
  blank: { dot: 'bg-muted-foreground/40', text: 'text-muted-foreground', ring: 'ring-transparent' },
};

export function ReviewSectionCard({
  review,
  values,
  open,
  onToggle,
  onChange,
  onConfirm,
  onConfirmSection,
  context,
}: {
  review: SectionReview;
  values: readonly FieldValue[];
  open: boolean;
  onToggle: () => void;
  onChange: (name: string, value: FormValue) => void;
  onConfirm: (name: string) => void;
  onConfirmSection: (names: string[]) => void;
  context: FormContext;
}) {
  const tone = TONE[review.status];

  return (
    <section
      id={`section-${review.section.key}`}
      className={`overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ${tone.ring} scroll-mt-24`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-4 text-left"
        aria-expanded={open}
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${tone.dot}`} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="truncate font-medium text-foreground">{review.section.title}</span>
            <span className={`shrink-0 text-xs ${tone.text}`}>{review.headline}</span>
          </span>
          {/* A closed section still has to say what is inside it. */}
          {!open && review.digest && (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{review.digest}</span>
          )}
        </span>
        <span className={`shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}>⌄</span>
      </button>

      {/* Animating grid rows collapses to the content's own height without
          measuring it, so no layout jump and no JS. Hiding it also keeps the
          fields of a closed section out of the tab order. */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr] invisible'
        }`}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-4 border-t border-border p-4">
            {review.unconfirmed.length > 1 && (
              <button
                type="button"
                onClick={() => onConfirmSection(review.unconfirmed.map((f) => f.name))}
                className="self-start rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground"
              >
                ✓ 确认本节 {review.unconfirmed.length} 项建议
              </button>
            )}

            {review.section.fields.map((field) => (
              <FormFieldRow
                key={field.name}
                field={field}
                entry={values.find((v) => v.name === field.name)}
                onChange={onChange}
                onConfirm={onConfirm}
                context={context}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
