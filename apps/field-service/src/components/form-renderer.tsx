import type { ComponentType } from 'react';
import { Link } from 'react-router-dom';
import type { FieldValue, FormField, FormSchema, FormValue } from '@/domain/form-schema';
import { valueOf } from '@/domain/form-schema';

/**
 * Renders a form from its definition.
 *
 * The definition is data, so this component knows nothing about any particular
 * form. Widgets the platform does not provide are resolved through a registry,
 * and an unrecognised one renders a visible notice rather than disappearing:
 * a field silently missing from a service report is worse than an ugly one.
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
      className="inline-block rounded-lg bg-white px-3 py-1.5 text-sm text-blue-700 ring-1 ring-slate-200"
    >
      查看{context.customerName ?? '客户'}档案
    </Link>
  );
}

const CUSTOM_WIDGETS: Record<string, ComponentType<CustomWidgetProps>> = {
  CustomerProfileLink,
};

export function FormRenderer({
  schema,
  values,
  onChange,
  context,
}: {
  schema: FormSchema;
  values: readonly FieldValue[];
  onChange: (name: string, value: FormValue) => void;
  context: FormContext;
}) {
  return (
    <div className="flex flex-col gap-4">
      {schema.sections.map((section) => (
        <section key={section.key} className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="font-medium text-slate-900">{section.title}</h2>
          <div className="mt-3 flex flex-col gap-4">
            {section.fields.map((field) => (
              <FieldRow
                key={field.name}
                field={field}
                entry={valueOf(values, field.name)}
                onChange={onChange}
                context={context}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function FieldRow({
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

  return (
    <div className="flex flex-col gap-1">
      <span className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
        {field.label}
        {field.required && <span className="text-rose-500">*</span>}
        {entry?.source === 'ai' && (
          <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">
            建议{entry.confidence ? ` ${Math.round(entry.confidence * 100)}%` : ''}
          </span>
        )}
        {entry?.source === 'prefill' && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">自动带入</span>
        )}
      </span>
      <FieldControl field={field} value={value} set={set} context={context} onChange={onChange} />
    </div>
  );
}

function FieldControl({
  field,
  value,
  set,
  context,
  onChange,
}: {
  field: FormField;
  value: FormValue | undefined;
  set: (value: FormValue) => void;
  context: FormContext;
  onChange: (name: string, value: FormValue) => void;
}) {
  const inputClass = 'rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50';

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
      // Beyond a handful of choices a list of radios stops being scannable.
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
        <div className="flex flex-wrap gap-2">
          {options.map((option) => (
            <button
              key={option.key}
              type="button"
              disabled={field.readonly}
              onClick={() => set(selected === option.key ? '' : option.key)}
              className={`rounded-full px-3 py-1 text-sm ring-1 ${
                selected === option.key
                  ? 'bg-slate-900 text-white ring-slate-900'
                  : 'bg-white text-slate-700 ring-slate-200'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      );
    }

    case 'multi-select': {
      const selected = Array.isArray(value) ? value : [];
      return (
        <div className="flex flex-wrap gap-2">
          {(field.options ?? []).map((option) => {
            const on = selected.includes(option.key);
            return (
              <button
                key={option.key}
                type="button"
                disabled={field.readonly}
                onClick={() => set(on ? selected.filter((k) => k !== option.key) : [...selected, option.key])}
                className={`rounded-full px-3 py-1 text-sm ring-1 ${
                  on ? 'bg-emerald-600 text-white ring-emerald-600' : 'bg-white text-slate-700 ring-slate-200'
                }`}
              >
                {option.label}
              </button>
            );
          })}
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
      return <Widget field={field} value={value} onChange={(next) => onChange(field.name, next)} context={context} />;
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
