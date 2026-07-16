/**
 * Shared schedule controls — a single source for picking a wall-clock time and a
 * duration, reused by every reschedule / create / edit surface so the UX and
 * defaults stay consistent.
 */
import { useState } from 'react';
import { Clock, Timer } from 'lucide-react';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getLocale, t, type Locale } from '@/lib/i18n';
import { DURATION_PRESETS, type ScheduleValue } from '@/lib/activity-schedule';

/** Native time-of-day input, styled to match the app's inputs. */
export function TimeInput({
  value,
  onChange,
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <input
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className={cn(
        'h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground',
        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0',
        className,
      )}
    />
  );
}

/** Duration selector driven by the shared preset list. */
export function DurationSelect({
  value,
  onChange,
  locale,
  className,
}: {
  value: number;
  onChange: (minutes: number) => void;
  locale: Locale;
  className?: string;
}) {
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger className={cn('h-9', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {DURATION_PRESETS.map((p) => (
          <SelectItem key={p.minutes} value={String(p.minutes)}>
            {t(p.labelKey, locale)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Labeled time + duration row for use alongside a date control in forms. */
export function TimeDurationFields({
  time,
  durationMinutes,
  onTimeChange,
  onDurationChange,
  locale,
  className,
}: {
  time: string;
  durationMinutes: number;
  onTimeChange: (value: string) => void;
  onDurationChange: (minutes: number) => void;
  locale: Locale;
  className?: string;
}) {
  return (
    <div className={cn('grid grid-cols-2 gap-2', className)}>
      <div>
        <span className="text-[11px] text-muted-foreground flex items-center gap-1 mb-1">
          <Clock className="w-3 h-3" />
          {t('fieldTime', locale)}
        </span>
        <TimeInput value={time} onChange={onTimeChange} className="w-full" ariaLabel={t('fieldTime', locale)} />
      </div>
      <div>
        <span className="text-[11px] text-muted-foreground flex items-center gap-1 mb-1">
          <Timer className="w-3 h-3" />
          {t('fieldDuration', locale)}
        </span>
        <DurationSelect value={durationMinutes} onChange={onDurationChange} locale={locale} className="w-full" />
      </div>
    </div>
  );
}

/**
 * Reschedule picker body — calendar + time + duration + confirm. Drop this inside
 * a `<PopoverContent>` (each surface keeps its own trigger). Confirms the whole
 * `ScheduleValue` at once (multi-field, so it can't auto-close on date select).
 */
export function ReschedulePickerBody({
  initial,
  disablePast = true,
  onConfirm,
  confirming,
}: {
  initial: ScheduleValue;
  disablePast?: boolean;
  onConfirm: (value: ScheduleValue) => void;
  confirming?: boolean;
}) {
  const locale = getLocale();
  const [date, setDate] = useState<Date>(initial.date);
  const [time, setTime] = useState<string>(initial.time);
  const [durationMinutes, setDurationMinutes] = useState<number>(initial.durationMinutes);

  return (
    <div className="w-[280px] p-2">
      <CalendarPicker
        mode="single"
        selected={date}
        onSelect={(d?: Date) => { if (d) setDate(d); }}
        disabled={disablePast ? (d: Date) => {
          const start = new Date();
          start.setHours(0, 0, 0, 0);
          return d < start;
        } : undefined}
      />
      <TimeDurationFields
        time={time}
        durationMinutes={durationMinutes}
        onTimeChange={setTime}
        onDurationChange={setDurationMinutes}
        locale={locale}
        className="px-1 pt-1"
      />
      <Button
        size="sm"
        className="w-full mt-2.5"
        disabled={confirming}
        onClick={() => onConfirm({ date, time, durationMinutes })}
      >
        {t('confirm', locale)}
      </Button>
    </div>
  );
}
