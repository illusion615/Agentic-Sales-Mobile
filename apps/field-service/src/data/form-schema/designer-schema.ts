/**
 * Anti-corruption layer for form definitions authored in the form designer.
 *
 * The designer's export is one shape among several the app will meet — today a
 * JSON fixture, tomorrow a Dataverse row, later whatever a customer's own
 * system emits. Keeping the translation here means a new source costs a new
 * parser, while the renderer, completeness rules and extraction keep working
 * against the one canonical schema.
 *
 * Definitions come from outside, so a malformed field is skipped and reported
 * rather than thrown: one bad entry must not blank the whole form on site.
 */
import type { FormField, FormFieldOption, FormFieldType, FormSchema, FormSection } from '@/domain/form-schema';

/** Designer widget name to canonical type. Unknown names become custom widgets. */
const TYPE_MAP: Record<string, FormFieldType> = {
  Input: 'text',
  Text: 'text',
  TextArea: 'textarea',
  Textarea: 'textarea',
  Number: 'number',
  InputNumber: 'number',
  DatePicker: 'date',
  DateTimePicker: 'date',
  Radio: 'single-select',
  Select: 'single-select',
  CheckBox: 'multi-select',
  Checkbox: 'multi-select',
  Switch: 'boolean',
};

interface RawOption {
  key?: unknown;
  text?: unknown;
}

interface RawItem {
  name?: unknown;
  label?: unknown;
  type?: unknown;
  required?: unknown;
  readonly?: unknown;
  expression?: unknown;
  options?: unknown;
}

interface RawSection {
  key?: unknown;
  title?: unknown;
  items?: unknown;
}

export interface ParsedFormSchema {
  schema: FormSchema;
  /** Entries that could not be read, and unknown widget names. */
  warnings: string[];
}

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value : undefined;

function parseOptions(raw: unknown): FormFieldOption[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const options = raw
    .map((entry) => {
      const option = entry as RawOption;
      const key = asString(option.key) ?? asString(option.text);
      const label = asString(option.text) ?? key;
      return key && label ? { key, label } : null;
    })
    .filter((option): option is FormFieldOption => option !== null);
  return options.length > 0 ? options : undefined;
}

function parseField(raw: RawItem, warnings: string[], sectionTitle: string): FormField | null {
  const name = asString(raw.name);
  const label = asString(raw.label);
  const widget = asString(raw.type);

  if (!name || !widget) {
    warnings.push(`「${sectionTitle}」中有字段缺少 name 或 type，已跳过`);
    return null;
  }

  const mapped = TYPE_MAP[widget];
  // An unmapped widget is not an error here: whether it can be rendered is the
  // renderer's registry to answer, and it reports a missing one in place.
  const options = parseOptions(raw.options);
  const type: FormFieldType = mapped ?? 'custom';

  // A choice field with no options cannot be answered; degrade to free text so
  // the technician is never faced with an empty picker.
  if ((type === 'single-select' || type === 'multi-select') && !options) {
    warnings.push(`选项为空的选择题 ${label ?? name}，已按文本输入处理`);
    return {
      name,
      label: label ?? name,
      type: 'text',
      required: raw.required === true,
      readonly: raw.readonly === true,
      prefill: asString(raw.expression),
    };
  }

  return {
    name,
    label: label ?? name,
    type,
    required: raw.required === true,
    readonly: raw.readonly === true,
    options,
    customType: mapped ? undefined : widget,
    prefill: asString(raw.expression),
  };
}

export function parseDesignerFormSchema(
  raw: unknown,
  meta: { id: string; title: string },
): ParsedFormSchema {
  const warnings: string[] = [];

  if (!Array.isArray(raw)) {
    return { schema: { ...meta, sections: [] }, warnings: ['表单定义不是数组，已忽略'] };
  }

  const sections: FormSection[] = raw
    .map((entry, index) => {
      const section = entry as RawSection;
      const title = asString(section.title) ?? `第 ${index + 1} 节`;
      const key = asString(section.key) ?? `section-${index}`;
      const items = Array.isArray(section.items) ? section.items : [];

      const fields = items
        .map((item) => parseField(item as RawItem, warnings, title))
        .filter((field): field is FormField => field !== null);

      if (fields.length === 0) warnings.push(`「${title}」没有可用字段`);
      return { key, title, fields };
    })
    .filter((section) => section.fields.length > 0);

  return { schema: { ...meta, sections }, warnings };
}
