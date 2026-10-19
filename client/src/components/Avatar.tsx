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
  return (
    <UIAvatar className={cn(SIZE[size], 'after:hidden', className)} title={user.name} aria-hidden="true">
      <AvatarFallback className="font-semibold text-[length:inherit] text-white" style={{ background: `var(--c-${user.color ?? 'purple'})` }}>
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
    <AvatarGroup className="-space-x-1.5" aria-label={users.map((u) => u.name).join(', ')}>
      {users.slice(0, max).map((u, i) => (
        <Avatar key={u.id ?? i} user={u} size="xs" className="ring-2 ring-card" />
      ))}
      {extra > 0 && <AvatarGroupCount className="size-5 text-[9px] ring-card">+{extra}</AvatarGroupCount>}
    </AvatarGroup>
  );
}
