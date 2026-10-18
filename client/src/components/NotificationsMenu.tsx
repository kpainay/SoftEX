import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, qs, type Notification } from '../api';
import { plainMentions, timeAgo } from '../format';
import { useApi, useRealtime } from '../hooks';
import { GroupCount, KIND_ICON } from '../pages/Inbox';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

type Item = Notification;

/**
 * The bell in the top bar: opens a list of recent notifications. Choosing one marks it read
 * and goes to what it's about; the full history stays in the Inbox.
 */
export function NotificationsMenu({ unread, onChange }: { unread: number; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const navigate = useNavigate();
  const { data, reload, setData } = useApi<{ notifications: Item[]; unread: number }>(
    open ? `/notifications${qs({ filter: onlyUnread ? 'unread' : 'all', limit: 12 })}` : null,
  );
  useRealtime((e) => (e.type === 'notification' || e.type === 'notifications.read') && open && reload());

  const choose = (n: Item) => {
    setOpen(false);
    if (!n.read_at) {
      void api.post(`/notifications/${n.id}/read`, { read: true }).then(onChange, () => {});
      setData(data && { ...data, notifications: data.notifications.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)) });
    }
    navigate(n.link || '/inbox');
  };

  const markAll = async () => {
    await api.post('/notifications/read-all');
    onChange();
    reload();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="ghost" size="icon" className="relative" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} />}
      >
        <Icon name="bell" />
        {unread ? (
          <Badge className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 text-[10px] tabular-nums">{unread > 99 ? '99+' : unread}</Badge>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-1.5rem))] max-h-[calc(100dvh-5rem)] gap-0 overflow-hidden p-0">
        <PopoverHeader className="flex-row flex-wrap items-center gap-2 border-b px-4 py-3">
          <PopoverTitle className="mr-auto">Notifications</PopoverTitle>
          <Tabs value={onlyUnread ? 'unread' : 'all'} onValueChange={(v) => setOnlyUnread(v === 'unread')}>
            <TabsList className="h-7">
              <TabsTrigger value="all" className="px-2 text-xs">
                All
              </TabsTrigger>
              <TabsTrigger value="unread" className="px-2 text-xs">
                Unread{data?.unread ? ` (${data.unread})` : ''}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {!!data?.unread && (
            <Button variant="link" size="inline" className="w-full justify-end text-xs" onClick={markAll}>
              Mark all read
            </Button>
          )}
        </PopoverHeader>
        <div className="max-h-[min(26rem,60dvh)] overflow-y-auto overscroll-contain">
          {!data && (
            <div className="flex flex-col gap-2 p-3">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          )}
          {data && !data.notifications.length && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">{onlyUnread ? 'No unread notifications. You’re all caught up.' : 'No notifications yet.'}</p>
          )}
          <div className="flex flex-col p-1">
            {data?.notifications.map((n) => (
              <button
                key={n.id}
                className={cn(
                  'notif-item flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted',
                  !n.read_at && 'unread bg-accent/50',
                  n.urgent && 'border-l-2 border-destructive',
                )}
                onClick={() => choose(n)}
              >
                {n.actor_name ? (
                  <Avatar user={{ id: n.actor_id ?? undefined, name: n.actor_name, color: n.actor_color ?? 'purple' }} size="sm" />
                ) : (
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Icon name={KIND_ICON[n.kind] ?? 'bell'} size={14} />
                  </span>
                )}
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={cn('text-sm', !n.read_at && 'font-semibold')}>
                    {n.title}
                    <GroupCount n={n} />
                  </span>
                  {n.body && <span className="line-clamp-2 text-xs text-muted-foreground">{plainMentions(n.body)}</span>}
                  <time className="text-xs text-muted-foreground">{timeAgo(n.created_at)}</time>
                </span>
                {!n.read_at && <i className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
              </button>
            ))}
          </div>
        </div>
        <div className="border-t p-1">
          <Link
            to="/inbox"
            onClick={() => setOpen(false)}
            className={buttonVariants({
              variant: "ghost",
              className: "w-full"
            })}>Open Inbox <Icon name="arrow" data-icon="inline-end" />
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
