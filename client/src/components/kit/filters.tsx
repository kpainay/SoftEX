import type { ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { CountBadge } from './pills';

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
  count?: number;
  icon?: ReactNode;
}

/**
 * A row of tabs that switches what a page shows. The row scrolls sideways on its own when it
 * does not fit (phones), rather than pushing the page wider.
 */
export function TabBar<T extends string>({
  tabs,
  value,
  onChange,
  variant = 'line',
  className,
  'aria-label': ariaLabel,
}: {
  tabs: TabItem<T>[];
  value: T;
  onChange: (v: T) => void;
  variant?: 'line' | 'default';
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as T)} className={cn('min-w-0', className)}>
      <ScrollArea className="w-full">
        <TabsList variant={variant} aria-label={ariaLabel} className={cn(variant === 'line' && 'h-10 w-max justify-start gap-1 border-b border-border px-0 pb-1')}>
          {tabs.map((t) => (
            <TabsTrigger key={t.id} value={t.id} className="flex-none px-3">
              {t.icon}
              {t.label}
              <CountBadge count={t.count} tone="neutral" />
            </TabsTrigger>
          ))}
        </TabsList>
        <ScrollBar orientation="horizontal" className="h-1.5" />
      </ScrollArea>
    </Tabs>
  );
}

/** Two to five mutually exclusive choices shown side by side (a view switcher, a time range). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'sm',
  className,
  'aria-label': ariaLabel,
}: {
  options: { value: T; label: ReactNode; title?: string }[];
  value: T;
  onChange: (v: T) => void;
  size?: 'sm' | 'default';
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <ToggleGroup
      variant="outline"
      size={size}
      spacing={0}
      value={[value]}
      onValueChange={(v) => v[0] && onChange(v[0] as T)}
      className={className}
      aria-label={ariaLabel}
    >
      {options.map((o) => (
        <ToggleGroupItem key={o.value} value={o.value} title={o.title} aria-label={o.title}>
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** A search box with a magnifier and a clear button. */
export function SearchField({
  value,
  onChange,
  placeholder = 'Search…',
  className,
  autoFocus,
  'aria-label': ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  'aria-label'?: string;
}) {
  return (
    <InputGroup className={cn('max-w-sm', className)}>
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
      <InputGroupInput type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={ariaLabel ?? placeholder} autoFocus={autoFocus} />
      {value && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" aria-label="Clear search" onClick={() => onChange('')}>
            <X />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}

/** The strip of search, filters and view switches above a list. Wraps on narrow screens. */
export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-wrap items-center gap-2', className)}>{children}</div>;
}

/** Quick filters that can be combined (Mine, Overdue, Urgent…). */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  className,
  'aria-label': ariaLabel,
}: {
  options: { value: T; label: ReactNode; count?: number }[];
  value: T[];
  onChange: (v: T[]) => void;
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <ToggleGroup multiple variant="outline" size="sm" value={value} onValueChange={(v) => onChange(v as T[])} className={cn('flex-wrap', className)} aria-label={ariaLabel}>
      {options.map((o) => (
        <ToggleGroupItem key={o.value} value={o.value} className="rounded-full">
          {o.label}
          <CountBadge count={o.count} tone="neutral" />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
