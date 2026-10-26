import { cn } from '@/lib/utils';
import { Avatar as UIAvatar, AvatarBadge, AvatarFallback, AvatarGroup, AvatarGroupCount } from '@/components/ui/avatar';
import { initials } from '../format';
import { realtime } from '../realtime';

const SIZE = {
  xs: 'size-5 text-[9px]',
  sm: 'size-6 text-[10px]',
  md: 'size-8 text-xs',
  lg: 'size-10 text-sm',
  xl: 'size-16 text-xl',
} as const;

/**
 * Initials stay readable on every member colour (WCAG AA, 4.5:1): dark ink on the light colours, white on
 * slightly deepened purple and blue.
 */
const ON_COLOUR: Record<string, { bg?: string; fg: string }> = {
  purple: { bg: '#6252dc', fg: '#ffffff' },
  blue: { bg: '#3a6bd0', fg: '#ffffff' },
};
const INK = '#2b2118';

/** A member's initials on their own colour, optionally with a presence dot. */
export function Avatar({
  user,
  size = 'md',
  showPresence = false,
  className,
}: {
  user: { id?: string; name: string; color?: string; status?: string } | null | undefined;
  size?: keyof typeof SIZE;
  showPresence?: boolean;
  className?: string;
}) {
  if (!user)
    return (
      <UIAvatar className={cn(SIZE[size], className)} aria-hidden="true">
        <AvatarFallback className="text-[length:inherit]">?</AvatarFallback>
      </UIAvatar>
    );
  const online = user.id ? realtime.online.has(user.id) : false;
  const colour = user.color ?? 'purple';
  return (
    <UIAvatar className={cn(SIZE[size], 'after:hidden', className)} title={user.name} aria-hidden="true">
      <AvatarFallback
        className="font-semibold text-[length:inherit]"
        style={{ background: ON_COLOUR[colour]?.bg ?? `var(--c-${colour})`, color: ON_COLOUR[colour]?.fg ?? INK }}
      >
        {initials(user.name)}
      </AvatarFallback>
      {showPresence && (
        <AvatarBadge className={cn('size-2.5', user.status === 'focus' ? 'bg-primary' : online ? 'bg-success' : 'bg-muted-foreground/50')} />
      )}
    </UIAvatar>
  );
}

export function AvatarStack({ users, max = 3, total }: { users: { id?: string; name: string; color?: string }[]; max?: number; total?: number }) {
  const extra = (total ?? users.length) - Math.min(max, users.length);
  return (
    <AvatarGroup className="-space-x-1.5" role="img" aria-label={users.map((u) => u.name).join(', ')}>
      {users.slice(0, max).map((u, i) => (
        <Avatar key={u.id ?? i} user={u} size="xs" className="ring-2 ring-card" />
      ))}
      {extra > 0 && <AvatarGroupCount className="size-5 text-[9px] ring-card">+{extra}</AvatarGroupCount>}
    </AvatarGroup>
  );
}
