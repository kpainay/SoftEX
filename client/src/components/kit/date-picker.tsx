import { useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { CalendarIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { dateLabel } from '../../format';

/** "YYYY-MM-DD" ⇄ a local Date (never UTC, so the day doesn't shift across time zones). */
export const parseDay = (value: string | null | undefined) => (value && /^\d{4}-\d{2}-\d{2}/.test(value) ? new Date(`${value.slice(0, 10)}T00:00:00`) : undefined);
export const formatDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

interface DatePickerProps {
  /** "YYYY-MM-DD", or empty for no date. */
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  placeholder?: string;
  /** Show a button to clear the date. */
  clearable?: boolean;
  min?: string;
  max?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  size?: 'sm' | 'default';
  'aria-label'?: string;
}

/** Pick one day from a calendar. */
export function DatePicker({ value, onChange, placeholder = 'Pick a date', clearable = true, min, max, disabled, id, className, size = 'default', ...rest }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = parseDay(value);
  const before = parseDay(min);
  const after = parseDay(max);
  const trigger = (
    <PopoverTrigger
      render={
        <Button
          id={id}
          variant="outline"
          size={size}
          disabled={disabled}
          aria-label={rest['aria-label'] ? `${rest['aria-label']}${selected ? `: ${dateLabel(value)}` : ''}` : undefined}
          className={cn('justify-start font-normal', !selected && 'text-muted-foreground', !clearable && className)}
        />
      }
    >
      <CalendarIcon data-icon="inline-start" />
      {selected ? dateLabel(value) : placeholder}
    </PopoverTrigger>
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      {clearable && selected ? (
        <ButtonGroup className={cn('max-w-full', className)}>
          {trigger}
          <Button variant="outline" size={size === 'sm' ? 'icon-sm' : 'icon'} aria-label="Clear date" onClick={() => onChange(null)} disabled={disabled}>
            <X />
          </Button>
        </ButtonGroup>
      ) : (
        trigger
      )}
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          disabled={[...(before ? [{ before }] : []), ...(after ? [{ after }] : [])]}
          onSelect={(d) => {
            onChange(d ? formatDay(d) : null);
            setOpen(false);
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}

/** A day and a time of day. Value is a local "YYYY-MM-DDTHH:mm" (what the API's datetime fields take). */
export function DateTimePicker({
  value,
  onChange,
  disabled,
  className,
  id,
  'aria-label': ariaLabel,
}: {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  'aria-label'?: string;
}) {
  const day = value?.slice(0, 10) ?? '';
  const time = value?.slice(11, 16) || '09:00';
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <DatePicker id={id} value={day} clearable={false} disabled={disabled} aria-label={ariaLabel ? `${ariaLabel} date` : undefined} onChange={(d) => onChange(d ? `${d}T${time}` : null)} />
      <TimePicker value={time} disabled={disabled || !day} aria-label={ariaLabel ? `${ariaLabel} time` : 'Time'} onChange={(t) => day && onChange(`${day}T${t}`)} />
    </div>
  );
}

/** A time of day ("HH:mm"). Uses the device's own time picker, which is the friendliest on phones. */
export function TimePicker({ value, onChange, disabled, className, id, step = 300, 'aria-label': ariaLabel }: { value: string; onChange: (v: string) => void; disabled?: boolean; className?: string; id?: string; step?: number; 'aria-label'?: string }) {
  return (
    <Input
      id={id}
      type="time"
      step={step}
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      className={cn('w-32 appearance-none bg-background [&::-webkit-calendar-picker-indicator]:hidden', className)}
    />
  );
}

/** Pick a span of days, for reports and filters. */
export function DateRangePicker({
  from,
  to,
  onChange,
  placeholder = 'Any time',
  className,
}: {
  from: string | null | undefined;
  to: string | null | undefined;
  onChange: (range: { from: string | null; to: string | null }) => void;
  placeholder?: string;
  className?: string;
}) {
  const range: DateRange | undefined = from ? { from: parseDay(from), to: parseDay(to) } : undefined;
  const label = from ? (to && to !== from ? `${dateLabel(from)} – ${dateLabel(to)}` : dateLabel(from)) : placeholder;
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" className={cn('justify-start font-normal', !from && 'text-muted-foreground', className)} />}>
        <CalendarIcon data-icon="inline-start" />
        {label}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          numberOfMonths={2}
          selected={range}
          defaultMonth={range?.from}
          onSelect={(r) => onChange({ from: r?.from ? formatDay(r.from) : null, to: r?.to ? formatDay(r.to) : null })}
        />
        {from && (
          <div className="flex justify-end border-t p-2">
            <Button variant="ghost" size="sm" onClick={() => onChange({ from: null, to: null })}>
              Clear
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
