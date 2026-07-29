import type { ComponentType } from 'react';
import { Link } from 'react-router-dom';
import type { FieldValue, FormField, FormValue } from '@/domain/form-schema';

/**
 * One field of a data-defined form.
 *
 * Knows nothing about any particular form: everything it renders comes from the
 * definition. Widgets the platform does not provide are resolved through a
 * registry, and an unrecognised one renders a visible notice rather than
 * disappearing — a field silently missing from a service report is worse than
 * an ugly one.
 */

export interface FormContext {
  workOrderId: string;
  customerName?: string;
}

export interface CustomWidgetProps {
  field: FormField;
  value: FormValue | undefined;
  onChange: (value: FormValue) => void;
  context: FormContext;
}

function CustomerProfileLink({ context }: CustomWidgetProps) {
  return (
    <Link
      to={`/work-orders/${context.workOrderId}`}
      className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-sm text-blue-700 ring-1 ring-slate-200"
    >
      查看{context.customerName ?? '客户'}档案 →
    </Link>
  );
}

const CUSTOM_WIDGETS: Record<string, ComponentType<CustomWidgetProps>> = {
  CustomerProfileLink,
};

export function FormFieldRow({
  field,
  entry,
  onChange,
  onConfirm,
  context,
}: {
  field: FormField;
  entry: FieldValue | undefined;
  onChange: (name: string, value: FormValue) => void;
  onConfirm: (name: string) => void;
  context: FormContext;
}) {
  const proposed = entry?.source === 'ai';

  return (
    <div className={`flex flex-col gap-1.5 ${proposed ? '-mx-2 rounded-lg bg-blue-50/60 px-2 py-2' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-700">{field.label}</span>
        {field.required && <span className="-ml-1 text-rose-500">*</span>}

        {proposed && (
          // Accepting is one tap: review is mostly agreeing, and making the
          // technician retype a correct value to own it would guarantee
          // rubber-stamping instead.
          <button
            type="button"
            onClick={() => onConfirm(field.name)}
            className="rounded-full bg-blue-600 px-2 py-0.5 text-xs text-white"
          >
            ✓ 确认{entry?.confidence ? ` · 建议 ${Math.round(entry.confidence * 100)}%` : ''}
          </button>
        )}
        {entry?.source === 'prefill' && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">自动带入</span>
        )}
      </div>

      <FieldControl field={field} entry={entry} onChange={onChange} context={context} />
    </div>
  );
}

function FieldControl({
  field,
  entry,
  onChange,
  context,
}: {
  field: FormField;
  entry: FieldValue | undefined;
  onChange: (name: string, value: FormValue) => void;
  context: FormContext;
}) {
  const value = entry?.value;
  const set = (next: FormValue) => onChange(field.name, next);
  const inputClass =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 disabled:bg-slate-50';

  switch (field.type) {
    case 'textarea':
      return (
        <textarea
          className={inputClass}
          rows={3}
          disabled={field.readonly}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => set(event.target.value)}
        />
      );

    case 'number':
      return (
        <input
          className={inputClass}
          type="number"
          inputMode="decimal"
          disabled={field.readonly}
          value={typeof value === 'number' || typeof value === 'string' ? String(value) : ''}
          onChange={(event) => set(event.target.value === '' ? null : Number(event.target.value))}
        />
      );

    case 'date':
      return (
        <input
          className={inputClass}
          type="date"
          disabled={field.readonly}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => set(event.target.value)}
        />
      );

    case 'boolean':
      return (
        <select
          className={inputClass}
          disabled={field.readonly}
          value={value === true ? 'true' : value === false ? 'false' : ''}
          onChange={(event) => set(event.target.value === '' ? null : event.target.value === 'true')}
        >
          <option value="">请选择</option>
          <option value="true">是</option>
          <option value="false">否</option>
        </select>
      );

    case 'single-select': {
      const options = field.options ?? [];
      const selected = typeof value === 'string' ? value : '';
      // Beyond a handful of choices a row of chips stops being scannable.
      if (options.length > 6) {
        return (
          <select className={inputClass} disabled={field.readonly} value={selected} onChange={(e) => set(e.target.value)}>
            <option value="">请选择</option>
            {options.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        );
      }
      return (
        <div className="flex flex-wrap gap-1.5">
          {options.map((option) => (
            <Chip
              key={option.key}
              label={option.label}
              on={selected === option.key}
              disabled={field.readonly}
              tone="slate"
              onClick={() => set(selected === option.key ? '' : option.key)}
            />
          ))}
        </div>
      );
    }

    case 'multi-select': {
      const selected = Array.isArray(value) ? value : [];
      return (
        <div className="flex flex-wrap gap-1.5">
          {(field.options ?? []).map((option) => (
            <Chip
              key={option.key}
              label={option.label}
              on={selected.includes(option.key)}
              disabled={field.readonly}
              tone="emerald"
              onClick={() =>
                set(
                  selected.includes(option.key)
                    ? selected.filter((k) => k !== option.key)
                    : [...selected, option.key],
                )
              }
            />
          ))}
        </div>
      );
    }

    case 'custom': {
      const Widget = field.customType ? CUSTOM_WIDGETS[field.customType] : undefined;
      if (!Widget) {
        return (
          <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
            此版本暂不支持控件「{field.customType ?? '未知'}」，请在后台系统中填写。
          </p>
        );
      }
      return <Widget field={field} value={value} onChange={set} context={context} />;
    }

    default:
      return (
        <input
          className={inputClass}
          disabled={field.readonly}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => set(event.target.value)}
        />
      );
  }
}

function Chip({
  label,
  on,
  tone,
  disabled,
  onClick,
}: {
  label: string;
  on: boolean;
  tone: 'slate' | 'emerald';
  disabled?: boolean;
  onClick: () => void;
}) {
  const active = tone === 'emerald' ? 'bg-emerald-600 text-white ring-emerald-600' : 'bg-slate-900 text-white ring-slate-900';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-sm ring-1 transition-colors ${
        on ? active : 'bg-white text-slate-600 ring-slate-200'
      }`}
    >
      {label}
    </button>
  );
}
