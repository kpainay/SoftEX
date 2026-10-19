import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export type Tone = 'neutral' | 'brand' | 'info' | 'success' | 'warning' | 'danger' | 'outline';

const VARIANT: Record<Tone, ComponentProps<typeof Badge>['variant']> = {
  neutral: 'secondary',
  brand: 'brand',
  info: 'info',
  success: 'success',
  warning: 'warning',
  danger: 'destructive',
  outline: 'outline',
};

/** A small rounded label. Pick the tone by meaning, never by colour. */
export function Pill({ tone = 'neutral', className, children, ...props }: Omit<ComponentProps<typeof Badge>, 'variant'> & { tone?: Tone }) {
  return (
    <Badge variant={VARIANT[tone]} className={className} {...props}>
      {children}
    </Badge>
  );
}

/** How the app's many status words map to a tone, so every screen colours them the same. */
const STATUS_TONE: Record<string, Tone> = {
  // Tasks
  todo: 'neutral',
  in_progress: 'info',
  review: 'warning',
  blocked: 'danger',
  done: 'success',
  // Priority
  urgent: 'danger',
  high: 'warning',
  // Requests, payments, deliveries, automation runs
  approved: 'success',
  pending: 'warning',
  rejected: 'danger',
  sent: 'success',
  delivered: 'success',
  failed: 'danger',
  error: 'danger',
  skipped: 'warning',
  // Plans
  trial: 'brand',
  active: 'success',
  grace: 'warning',
  // Impact
  medium: 'warning',
};

export const toneFor = (status: string | null | undefined, fallback: Tone = 'neutral'): Tone => (status && STATUS_TONE[status]) || fallback;

const TASK_STATUS: Record<string, string> = { todo: 'To do', in_progress: 'In progress', blocked: 'Blocked', review: 'In review', done: 'Done' };

export function StatusPill({ status, className }: { status: string; className?: string }) {
  return (
    <Pill tone={toneFor(status)} className={className}>
      {TASK_STATUS[status] ?? status}
    </Pill>
  );
}

export function PriorityPill({ priority, children, className }: { priority: string; children?: ReactNode; className?: string }) {
  if (priority !== 'urgent' && priority !== 'high' && !children) return null;
  return (
    <Pill tone={toneFor(priority)} className={className}>
      {children ?? (priority === 'urgent' ? 'Urgent' : 'High')}
    </Pill>
  );
}

const HEALTH: Record<string, { label: string; tone: string }> = {
  on_track: { label: 'On track', tone: 'bg-success' },
  at_risk: { label: 'At risk', tone: 'bg-warning' },
  off_track: { label: 'Off track', tone: 'bg-destructive' },
};

/** Project and goal health: a coloured dot and a word. */
export function HealthPill({ health, className }: { health: string; className?: string }) {
  const h = HEALTH[health];
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap', className)}>
      <i className={cn('size-2 rounded-full', h?.tone ?? 'bg-muted-foreground')} aria-hidden="true" />
      {h?.label ?? health}
    </span>
  );
}

/** A count bubble, for unread messages and the like. */
export function CountBadge({ count, tone = 'brand', className }: { count?: number | null; tone?: Tone; className?: string }) {
  if (!count) return null;
  return (
    <Pill tone={tone} className={cn('min-w-5 px-1.5 tabular-nums', className)}>
      {count > 99 ? '99+' : count}
    </Pill>
  );
}

/** A presence dot: available, focusing, busy or away. */
export function StatusDot({ status, className }: { status: string; className?: string }) {
  const color = status === 'available' ? 'bg-success' : status === 'focus' ? 'bg-primary' : status === 'busy' ? 'bg-destructive' : 'bg-muted-foreground/60';
  return <i className={cn('inline-block size-2 shrink-0 rounded-full', color, className)} aria-hidden="true" />;
}
