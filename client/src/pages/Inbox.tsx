import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs, type Notification } from '../api';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { EmptyState, ErrorState, IconButton, LoadingRows, Page, PageHeader, TabBar, useAction } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { plainMentions, timeAgo } from '../format';
import { useApi, useRealtime } from '../hooks';
import { Button } from '@/components/ui/button';

type Filter = 'all' | 'unread' | 'mentions' | 'assigned' | 'meetings';
export const KIND_ICON: Record<string, string> = {
  reminder: 'clock',
  billing: 'flag',
  deadline: 'calendar',
  automation: 'refresh',
  mention: 'chat',
  dm: 'chat',
  thread: 'thread',
  urgent: 'alert',
  assigned: 'task',
  review: 'eye',
  handoff: 'arrow',
  status: 'refresh',
  comment: 'chat',
  meeting: 'video',
  request: 'inboxCheck',
  announcement: 'megaphone',
  project: 'folder',
  channel: 'hash',
  page: 'book',
  file: 'file',
};

/** Names for notification kinds in the "Last 24 hours" summary: [one, many]. */
const KIND_LABEL: Record<string, [string, string]> = {
  reminder: ['reminder', 'reminders'],
  billing: ['billing notice', 'billing notices'],
  deadline: ['deadline', 'deadlines'],
  automation: ['automation', 'automations'],
  mention: ['mention', 'mentions'],
  dm: ['direct message', 'direct messages'],
  thread: ['thread reply', 'thread replies'],
  urgent: ['urgent message', 'urgent messages'],
  assigned: ['assignment', 'assignments'],
  review: ['review request', 'review requests'],
  handoff: ['handoff', 'handoffs'],
  status: ['status change', 'status changes'],
  comment: ['comment', 'comments'],
  meeting: ['meeting update', 'meeting updates'],
  request: ['request', 'requests'],
  announcement: ['announcement', 'announcements'],
  project: ['project update', 'project updates'],
  channel: ['channel update', 'channel updates'],
  page: ['page update', 'page updates'],
  file: ['file update', 'file updates'],
};
const kindLabel = (kind: string, count: number) => {
  const [one, many] = KIND_LABEL[kind] ?? [kind, kind];
  return `${count} ${count === 1 ? one : many}`;
};

/** The number badge on a row that stands for several unread updates about the same chat, task or meeting. */
export function GroupCount({ n }: { n: Notification }) {
  const count = n.group_count ?? 1;
  if (count < 2 || n.read_at) return null;
  return (
    <Badge className="group-count ml-1.5 h-4 min-w-4 px-1 align-middle text-[10px] tabular-nums" aria-label={`${count} unread updates`} title={`${count} unread updates`}>
      {count > 99 ? '99+' : count}
    </Badge>
  );
}

export function Inbox() {
  const [filter, setFilter] = useState<Filter>('all');
  // Set by the "Last 24 hours" pills to show one kind of notification.
  const [kind, setKind] = useState<string | null>(null);
  const act = useAction();
  const { data, error, reload, setData } = useApi<{ notifications: (Notification & { actor_name: string; actor_color: string })[]; unread: number }>(
    `/notifications${qs({ filter, kind, limit: 100 })}`,
  );
  const { data: digest } = useApi<{ kind: string; count: number; unread: number }[]>('/notifications/digest');
  useRealtime((e) => (e.type === 'notification' || e.type === 'notifications.read') && reload());

  const markRead = async (n: Notification, read = true) => {
    await api.post(`/notifications/${n.id}/read`, { read });
    setData(data && { ...data, notifications: data.notifications.map((x) => (x.id === n.id ? { ...x, read_at: read ? new Date().toISOString() : null } : x)) });
    // Reading a grouped row reads the rest of its group on the server; refetch so they show as read.
    if (read && (n.group_count ?? 1) > 1) reload();
  };

  return (
    <Page width="narrow">
      <PageHeader
        title="Activities"
        description="Mentions, assignments, reviews, meeting updates and approvals in one place."
        actions={
          <>
            <Button
              variant="ghost"
              onClick={async () => {
                await act(() => api.post('/notifications/clear'), 'Read notifications cleared');
                reload();
              }}
            >
              <Icon name="trash" data-icon="inline-start" /> Clear read
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                await act(() => api.post('/notifications/read-all'), 'All caught up');
                reload();
              }}
            >
              <Icon name="check" data-icon="inline-start" /> Mark all read
            </Button>
          </>
        }
      />
      {digest && digest.length > 0 && (
        <div className="digest flex flex-wrap items-center gap-1.5" aria-label="Last 24 hours" role="group">
          <span className="mr-1 text-xs text-muted-foreground">Last 24 hours:</span>
          {digest.map((d) => (
            <Badge
              key={d.kind}
              variant={kind === d.kind ? 'default' : 'outline'}
              className="pill-button h-6 cursor-pointer gap-1 px-2.5"
              render={
                <button
                  type="button"
                  aria-pressed={kind === d.kind}
                  onClick={() => {
                    setKind(kind === d.kind ? null : d.kind);
                    setFilter('all');
                  }}
                />
              }
            >
              <Icon name={KIND_ICON[d.kind] ?? 'bell'} /> {kindLabel(d.kind, d.count)}
              {d.unread ? ` · ${d.unread} new` : ''}
            </Badge>
          ))}
        </div>
      )}
      {kind && (
        <p className="text-sm text-muted-foreground">
          Showing {KIND_LABEL[kind]?.[1] ?? kind} only.{' '}
          <Button variant="link" size="inline" type="button" onClick={() => setKind(null)}>
            Show everything
          </Button>
        </p>
      )}
      <TabBar
        value={filter}
        onChange={(f) => {
          setFilter(f);
          setKind(null);
        }}
        tabs={[
          { id: 'all', label: 'All' },
          { id: 'unread', label: 'Unread', count: data?.unread },
          { id: 'mentions', label: 'Mentions & DMs' },
          { id: 'assigned', label: 'Tasks' },
          { id: 'meetings', label: 'Meetings' },
        ]}
      />
      {error && <ErrorState error={error} retry={reload} />}
      {!data && !error && <LoadingRows rows={6} />}
      {data && !data.notifications.length && (
        <EmptyState icon="inbox" title="Nothing here">
          You are all caught up.
        </EmptyState>
      )}
      {!!data?.notifications.length && (
        <Card className="gap-0 py-1.5">
          <ul className="flex flex-col">
            {data.notifications.map((n) => (
              <li
                key={n.id}
                className={cn(
                  'inbox-item group/row mx-1.5 flex items-start gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-muted/60',
                  !n.read_at && 'unread bg-accent/40',
                  n.urgent && 'border-l-2 border-destructive',
                )}
              >
                {n.actor_name ? (
                  <Avatar user={{ id: n.actor_id ?? undefined, name: n.actor_name, color: n.actor_color }} size="md" />
                ) : (
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Icon name={KIND_ICON[n.kind] ?? 'bell'} size={16} />
                  </span>
                )}
                <Link to={n.link || '/activities'} onClick={() => !n.read_at && markRead(n)} className="flex min-w-0 flex-1 flex-col gap-0.5 outline-none focus-visible:underline">
                  <span className={cn('flex items-center gap-1.5 text-sm', !n.read_at && 'font-semibold')}>
                    <Icon name={KIND_ICON[n.kind] ?? 'bell'} size={14} className="shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      {n.title}
                      <GroupCount n={n} />
                    </span>
                  </span>
                  {n.body && <span className="line-clamp-2 text-sm text-muted-foreground">{plainMentions(n.body)}</span>}
                  <time className="text-xs text-muted-foreground">{timeAgo(n.created_at)}</time>
                </Link>
                {!n.read_at && <i className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />}
                <IconButton label={n.read_at ? 'Mark as unread' : 'Mark as read'} size="icon-sm" onClick={() => markRead(n, !n.read_at)}>
                  <Icon name={n.read_at ? 'bell' : 'check'} />
                </IconButton>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Page>
  );
}
