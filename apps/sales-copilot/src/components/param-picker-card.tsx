import { useState } from 'react';
import { motion } from 'motion/react';
import { X, Check, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { getLocale, t, type Locale } from '@/lib/i18n';

/**
 * Param-picker card (missing-parameter gate). Renders the RIGHT control for the
 * value the update tool still needs:
 *   - chooseField        → chips of the settable fields ("what to change?")
 *   - chooseValue + enum → chips of the allowed values (dictionary selection)
 *   - chooseValue + scalar → a typed input (text / number / date)
 * Always offers Cancel so a blocking card can never trap the user.
 */
interface ParamPickerCardProps {
  messageId: string;
  paramPicker: {
    function: string;
    arguments: Record<string, unknown>;
    subjectLabel?: string;
    mode: 'chooseField' | 'chooseValue';
    field?: string;
    fieldLabel?: string;
    fieldKind?: 'enum' | 'text' | 'number' | 'date';
    options?: Array<{ value: string; label: string }>;
  };
  resolved?: boolean;
  resolutionResult?: string;
  onPickField?: (field: string) => void;
  onPickValue?: (value: string) => void;
  onCancel?: () => void;
}

export function ParamPickerCard({
  paramPicker,
  resolved = false,
  resolutionResult,
  onPickField,
  onPickValue,
  onCancel,
}: ParamPickerCardProps) {
  const locale: Locale = getLocale();
  const isZh = locale === 'zh-Hans';
  const [busy, setBusy] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const isResolved = resolved || busy;

  if (resolved) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-card p-3 rounded-xl opacity-70"
      >
        <div className="flex items-center gap-2">
          <Check className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="text-sm text-foreground truncate">
            {resolutionResult || (isZh ? '已更新' : 'Updated')}
          </span>
        </div>
      </motion.div>
    );
  }

  const subject = paramPicker.subjectLabel;
  const title = paramPicker.mode === 'chooseField'
    ? (isZh ? `要修改${subject ? `「${subject}」` : ''}的什么？` : `What do you want to change${subject ? ` for "${subject}"` : ''}?`)
    : (isZh ? `将${paramPicker.fieldLabel ?? ''}改为：` : `Set ${paramPicker.fieldLabel ?? 'value'} to:`);

  const isEnum = paramPicker.mode === 'chooseValue' && paramPicker.fieldKind === 'enum';
  const isScalar = paramPicker.mode === 'chooseValue' && paramPicker.fieldKind !== 'enum';
  const showChips = paramPicker.mode === 'chooseField' || isEnum;
  const inputType = paramPicker.fieldKind === 'number' ? 'number' : paramPicker.fieldKind === 'date' ? 'date' : 'text';

  const pickField = (f: string) => { if (!isResolved) onPickField?.(f); };
  const pickValue = (v: string) => { if (isResolved) return; setBusy(true); onPickValue?.(v); };
  const submitInput = () => { if (isResolved || !inputValue.trim()) return; setBusy(true); onPickValue?.(inputValue.trim()); };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={cn('glass-card p-4 rounded-xl', busy && 'opacity-60 pointer-events-none')}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Pencil className="w-4 h-4 text-primary" />
        </div>
        <h4 className="font-medium text-sm text-foreground">{title}</h4>
      </div>

      {showChips && (
        <div className="flex flex-wrap gap-2">
          {(paramPicker.options ?? []).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => (paramPicker.mode === 'chooseField' ? pickField(opt.value) : pickValue(opt.value))}
              disabled={isResolved}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm border border-border/60 bg-muted/40 text-foreground transition-colors',
                'hover:border-primary/60 hover:bg-primary/10',
                isResolved && 'opacity-60 cursor-not-allowed',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {isScalar && (
        <div className="flex gap-2">
          <Input
            autoFocus
            type={inputType}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitInput(); } }}
            placeholder={paramPicker.fieldLabel}
            disabled={isResolved}
            className="flex-1 h-9 text-sm"
          />
          <Button size="sm" onClick={submitInput} disabled={isResolved || !inputValue.trim()}>
            {isZh ? '确认' : 'Confirm'}
          </Button>
        </div>
      )}

      {onCancel && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-3 text-muted-foreground hover:text-foreground"
          onClick={() => { if (!isResolved) { setBusy(true); onCancel(); } }}
          disabled={isResolved}
        >
          <X className="w-4 h-4 mr-1" />
          {t('cancel', locale)}
        </Button>
      )}
    </motion.div>
  );
}
