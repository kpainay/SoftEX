import { Component, type ErrorInfo, type ReactNode } from 'react';
import { CircleCheck, Copy, Info, OctagonAlert, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Icon } from '../Icon';
import { notify } from './feedback';

/** Nothing here yet: an icon, a title, what to do next. */
export function EmptyState({
  icon = 'spark',
  title,
  children,
  action,
  className,
  tone,
}: {
  icon?: string;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  tone?: 'danger';
}) {
  return (
    <Empty className={className}>
      <EmptyHeader>
        <EmptyMedia variant="icon" className={cn(tone === 'danger' && 'bg-destructive/10 text-destructive')}>
          <Icon name={icon} />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {children && <EmptyDescription>{children}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}

/** A centred spinner while something loads. */
export function Loading({ label = 'Loading', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex min-h-40 items-center justify-center text-muted-foreground', className)} role="status">
      <Spinner className="size-6" aria-hidden="true" />
      <span className="sr-only">{label}…</span>
    </div>
  );
}

/** Placeholder rows for a list that is loading. */
export function LoadingRows({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

const CALLOUT_ICONS = { info: Info, success: CircleCheck, warning: TriangleAlert, danger: OctagonAlert };

/** A message in the page: information, a warning, an error or a success. */
export function Callout({
  tone = 'info',
  title,
  children,
  action,
  className,
  icon = true,
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger' | 'neutral';
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  icon?: boolean;
}) {
  const Glyph = tone === 'neutral' ? Info : CALLOUT_ICONS[tone];
  const variant = tone === 'danger' ? 'destructive' : tone === 'neutral' ? 'default' : tone;
  return (
    <Alert variant={variant} className={className} role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}>
      {icon && <Glyph />}
      {title && <AlertTitle>{title}</AlertTitle>}
      {children && <AlertDescription>{children}</AlertDescription>}
      {action && <AlertAction>{action}</AlertAction>}
    </Alert>
  );
}

export function ErrorState({ error, retry }: { error: Error; retry?: () => void }) {
  return (
    <EmptyState
      icon="alert"
      tone="danger"
      title={(error as Error & { status?: number }).status === 404 ? 'Not found, or you do not have access' : 'Could not load this'}
      action={
        retry && (
          <Button variant="outline" onClick={retry}>
            Try again
          </Button>
        )
      }
    >
      {error.message}
    </EmptyState>
  );
}

/**
 * Keeps a rendering bug in one screen from blanking the whole app: shows what broke and lets the person carry on.
 * Changing `resetKey` (for example the URL) clears the error.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: unknown }, { error: Error | null; key: unknown }> {
  state = { error: null as Error | null, key: this.props.resetKey };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  static getDerivedStateFromProps(props: { resetKey?: unknown }, state: { error: Error | null; key: unknown }) {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert">
        <EmptyState
          icon="alert"
          tone="danger"
          title="Something went wrong showing this"
          action={
            <Button variant="outline" onClick={() => this.setState({ error: null })}>
              Try again
            </Button>
          }
        >
          Your changes were saved. Try again, or reload the page if it keeps happening.
        </EmptyState>
      </div>
    );
  }
}

/** A secret shown once (API token, private link): a warning, the value to copy, and a copy button. */
export function SecretReveal({ title, value, children, actions }: { title: ReactNode; value: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <Alert variant="warning" className="token-reveal">
      <TriangleAlert />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <code className="block rounded-lg border bg-background px-3 py-2 font-mono text-xs break-all text-foreground select-all">{value}</code>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(value);
                notify('Copied', 'success');
              } catch {
                /* the code is selectable */
              }
            }}
          >
            <Copy data-icon="inline-start" /> Copy
          </Button>
          {actions}
        </div>
        {children}
      </AlertDescription>
    </Alert>
  );
}
