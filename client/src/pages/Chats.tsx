import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, qs, type Channel, type Message } from '../api';
import { ThreadAi } from '../components/Ai';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { RemindModal, WhenModal } from '../components/Later';
import { useShell } from '../components/Layout';
import { Markdown } from '../components/Markdown';
import { NewMeetingForm, NewTaskForm } from '../components/QuickCreate';
import {
  Callout,
  CountBadge,
  EmptyState,
  ErrorState,
  FormField,
  Hint,
  IconButton,
  Loading,
  LoadingRows,
  Modal,
  notify,
  Page,
  PageHeader,
  PeoplePicker,
  Pill,
  SearchField,
  Section,
  StatusPill,
  SwitchField,
  useAction,
  useConfirm,
} from '@/components/kit';
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from '@/components/ui/attachment';
import { Badge } from '@/components/ui/badge';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Card } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupTextarea } from '@/components/ui/input-group';
import { Marker, MarkerContent } from '@/components/ui/marker';
import { Message as ChatRow, MessageAvatar, MessageContent, MessageHeader } from '@/components/ui/message';
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
} from '@/components/ui/message-scroller';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { bytes, plainMentions, timeAgo, timeOf } from '../format';
import { useApi, useRealtime, useViewing } from '../hooks';
import { realtime } from '../realtime';
import { outbox, useOutbox, type Outgoing } from '../outbox';
import { useSession } from '../session';
import { MediaAttachment, VideoLinks, isPlayable } from '../components/Media';
import { FavoriteButton } from '../components/Favorites';
import { ForwardModal, ForwardedQuote, PollCard, PollModal, VoiceNoteButton } from '../components/ChatExtras';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

const EMOJI = ['👍', '❤️', '🎉', '✅', '👀', '😄', '🙏', '🚀'];

const channelIcon = (c: { kind: string }) => (c.kind === 'private' ? 'lock' : c.kind === 'announcement' ? 'megaphone' : c.kind === 'dm' ? 'chat' : 'hash');

// ======================= Chats (direct & group messages) =======================


/**
 * Whether pressing Enter sends a message (Shift+Enter then starts a new line) or starts a new line (Ctrl/⌘+Enter
 * then sends). Phones and tablets have no Shift key, so there Enter starts a new line unless the person changes it.
 * Remembered on this device.
 */
function useEnterSends() {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem('kuu:enter-sends');
      if (stored) return stored === '1';
    } catch {
      /* fall through to the device default */
    }
    return !window.matchMedia?.('(pointer: coarse)').matches;
  });
  const set = (next: boolean) => {
    setValue(next);
    try {
      localStorage.setItem('kuu:enter-sends', next ? '1' : '0');
    } catch {
      /* private mode: only for this visit */
    }
  };
  return [value, set] as const;
}

export function Chats() {
  const { openCreate } = useShell();
  const { data: channels, error, reload } = useApi<Channel[]>('/channels');
  const { data: saved } = useApi<(Message & { channel_name: string; channel_kind: string })[]>('/saved');
  useRealtime((e) => (e.type === 'message.created' || e.type === 'presence') && reload());
  const dms = (channels ?? []).filter((c) => c.kind === 'dm').sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? ''));
  return (
    <Page width="narrow">
      <PageHeader
        title="Chats"
        description="Direct and group conversations."
        actions={
          <Button onClick={() => openCreate('message')}>
            <Icon name="plus" data-icon="inline-start" /> New message
          </Button>
        }
      />
      {error && <ErrorState error={error} retry={reload} />}
      {!channels && !error && <LoadingRows rows={5} />}
      {channels && !dms.length && (
        <EmptyState
          icon="chat"
          title="No conversations yet"
          action={
            <Button onClick={() => openCreate('message')}>
              <Icon name="plus" data-icon="inline-start" /> New message
            </Button>
          }
        >
          Start a direct message with a teammate.
        </EmptyState>
      )}
      {dms.length > 0 && (
        <Card className="gap-0 p-1.5">
          <ul className="flex flex-col">
            {dms.map((c) => (
              <li key={c.id}>
                <Link to={`/channels/${c.id}`} className={cn('list-row flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted/60', c.unread && 'unread')}>
                  {c.members && c.members.length === 1 ? (
                    <Avatar user={c.members[0]} size="md" showPresence />
                  ) : (
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold" aria-hidden="true">
                      {c.members?.length ?? 0}
                    </span>
                  )}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-baseline justify-between gap-2">
                      <strong className={cn('truncate text-sm', c.unread ? 'font-semibold' : 'font-medium')}>{c.members?.map((m) => m.name).join(', ') || 'Just you'}</strong>
                      {c.last_message_at && <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(c.last_message_at)}</span>}
                    </span>
                    <span className={cn('list-preview truncate text-xs', c.unread ? 'text-foreground' : 'text-muted-foreground')}>
                      {c.last_message ? `${c.last_message.mine ? 'You: ' : ''}${plainMentions(c.last_message.text) || 'Sent an attachment'}` : 'No messages yet'}
                    </span>
                  </span>
                  <CountBadge count={c.unread} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {saved && saved.length > 0 && (
        <Section title="Saved messages">
          <Card className="gap-0 p-1.5">
            <ul className="flex flex-col">
              {saved.map((m) => (
                <li key={m.id}>
                  <Link to={`/channels/${m.channel_id}?message=${m.parent_id ?? m.id}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-muted/60">
                    <Avatar user={m.user} size="sm" />
                    <span className="flex min-w-0 flex-1 flex-col text-sm">
                      <strong className="font-medium">
                        {m.user?.name} <span className="text-xs font-normal text-muted-foreground">in {m.channel_kind === 'dm' ? 'a direct message' : `#${m.channel_name}`}</span>
                      </strong>
                      <span className="truncate text-xs text-muted-foreground">{plainMentions(m.body).slice(0, 140)}</span>
                    </span>
                    <Icon name="bookmark" size={16} className="text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      )}
    </Page>
  );
}

// ======================= Channel browser =======================

export function ChannelsBrowser() {
  const { me, people } = useSession();
  const navigate = useNavigate();
  const act = useAction();
  const { data: channels, error, reload } = useApi<Channel[]>('/channels');
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState('');
  const [form, setForm] = useState({ name: '', topic: '', kind: 'public', memberIds: [] as string[] });
  const list = (channels ?? []).filter((c) => c.kind !== 'dm' && (!filter || c.name.includes(filter.toLowerCase())));
  const create = async (e: FormEvent) => {
    e.preventDefault();
    const channel = await act(() => api.post<Channel>('/channels', form), 'Channel created');
    if (channel) navigate(`/channels/${channel.id}`);
  };
  return (
    <Page width="narrow">
      <PageHeader
        title="Channels"
        description="Team and project conversations. Join public channels, or ask to be added to private ones."
        actions={
          me!.role !== 'guest' && (
            <Button onClick={() => setCreating(true)}>
              <Icon name="plus" data-icon="inline-start" /> New channel
            </Button>
          )
        }
      />
      <SearchField placeholder="Filter channels" value={filter} onChange={setFilter} aria-label="Filter channels" />
      {error && <ErrorState error={error} retry={reload} />}
      {!channels && !error && <LoadingRows rows={5} />}
      {list.length > 0 && (
        <Card className="gap-0 p-1.5">
          <ul className="flex flex-col">
            {list.map((c) => (
              <li key={c.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-muted/60">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                  <Icon name={channelIcon(c)} size={16} />
                </span>
                <Link to={`/channels/${c.id}`} className="flex min-w-0 flex-1 flex-col text-sm">
                  <span className="flex flex-wrap items-center gap-2">
                    <strong className="font-medium">{c.name}</strong> {c.project_name && <Pill>{c.project_name}</Pill>}
                  </span>
                  {c.topic && <span className="truncate text-xs text-muted-foreground">{c.topic}</span>}
                </Link>
                <CountBadge count={c.unread} />
                {c.joined ? (
                  <span className="text-xs text-muted-foreground">Joined</span>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      await act(() => api.post(`/channels/${c.id}/join`), `Joined #${c.name}`);
                      reload();
                    }}
                  >
                    Join
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Modal open={creating} onClose={() => setCreating(false)} title="Create a channel">
        <form className="flex flex-col gap-4" onSubmit={create}>
          <FormField label="Name" hint="Lowercase letters, numbers and hyphens.">
            <Input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
              placeholder="e.g. design-crit"
              autoFocus
            />
          </FormField>
          <FormField label="Topic">
            <Input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} placeholder="What is this channel for?" />
          </FormField>
          <FormField label="Type">
            <NativeSelect value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <NativeSelectOption value="public">Public — anyone in the workspace can join</NativeSelectOption>
              <NativeSelectOption value="private">Private — invite only</NativeSelectOption>
              {['lead', 'admin', 'owner'].includes(me!.role) && <NativeSelectOption value="announcement">Announcement — only leads and admins post</NativeSelectOption>}
            </NativeSelect>
          </FormField>
          <FormField label="Add people">
            <PeoplePicker people={people} value={form.memberIds} onChange={(ids) => setForm({ ...form, memberIds: ids })} exclude={[me!.user.id]} />
          </FormField>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button type="submit">Create channel</Button>
          </div>
        </form>
      </Modal>
    </Page>
  );
}

// ======================= Channel view =======================

interface ChannelDetail extends Channel {
  members: { id: string; name: string; color: string; title: string; status: string; role: string }[];
  project: { id: string; name: string; color: string } | null;
  can_post: boolean;
  can_manage: boolean;
  created_by: string;
  archived_at: string | null;
  ai_excluded: boolean;
}

/** Inside the scroller: jump to a linked message (?message=…), or open its thread when it's a reply. */
function HighlightScroller({ highlight, loaded, exists, onThread }: { highlight: string | null; loaded: boolean; exists: boolean; onThread: (id: string) => void }) {
  const { scrollToMessage } = useMessageScroller();
  useEffect(() => {
    if (!highlight || !loaded) return;
    if (exists) window.requestAnimationFrame(() => scrollToMessage(highlight, { align: 'center' }));
    else onThread(highlight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlight, loaded]);
  return null;
}

export function ChannelView() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { me } = useSession();
  const act = useAction();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { data: channel, error, reload: reloadChannel } = useApi<ChannelDetail>(`/channels/${id}`);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [panel, setPanel] = useState<'members' | 'pins' | 'files' | null>(null);
  const [typing, setTyping] = useState<Record<string, { name: string; at: number }>>({});
  const [taskFrom, setTaskFrom] = useState<Message | null>(null);
  const [decisionFrom, setDecisionFrom] = useState<Message | null>(null);
  const [forwarding, setForwarding] = useState<Message | null>(null);
  const [meeting, setMeeting] = useState(false);
  const [adding, setAdding] = useState(false);
  const highlight = params.get('message');
  // Messages still on their way to the server show at the bottom straight away.
  const outgoing = useOutbox(id, null);
  // Messages that arrived while the chat was open glide in; ones already on screen as "sending" just settle.
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());
  useEffect(
    () =>
      outbox.onDelivered((message) => {
        if (message.channel_id !== id) return;
        if (message.parent_id) return void refreshMessage(message.parent_id);
        setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id],
  );
  const load = async (before?: string) => {
    const res = await api.get<{ messages: Message[]; has_more: boolean }>(`/channels/${id}/messages${qs({ before, limit: 50 })}`);
    setHasMore(res.has_more);
    setMessages((prev) => (before ? [...res.messages, ...prev] : res.messages));
    setLoaded(true);
  };

  useEffect(() => {
    setMessages([]);
    setFresh(new Set());
    setLoaded(false);
    setThreadId(null);
    load().catch(() => setLoaded(true));
    api.post(`/channels/${id}/read`).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);


  // While this chat (and any open thread) is on screen, new messages in it don't become notifications.
  useViewing(id ? [`/channels/${id}`, ...(threadId ? [`/channels/${id}?thread=${threadId}`] : [])] : []);
  // Coming back to the tab reads what arrived meanwhile, which also clears its notifications.
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && api.post(`/channels/${id}/read`).catch(() => {});
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [id]);

  const refreshMessage = async (messageId: string) => {
    const res = await api.get<{ root: Message; replies: Message[] }>(`/messages/${messageId}/thread`).catch(() => null);
    if (res) setMessages((prev) => prev.map((m) => (m.id === res.root.id ? res.root : m)));
  };

  useRealtime((e) => {
    if (e.type === 'message.created' && e.message.channel_id === id) {
      const settled = e.message.user?.id === me!.user.id && outbox.settle(e.message);
      if (e.message.parent_id) refreshMessage(e.message.parent_id);
      else {
        if (!settled) setFresh((f) => new Set(f).add(e.message.id));
        setMessages((prev) => (prev.some((m) => m.id === e.message.id) ? prev : [...prev, e.message]));
      }
      if (document.visibilityState === 'visible') api.post(`/channels/${id}/read`).catch(() => {});
      setTyping((t) => {
        const next = { ...t };
        delete next[e.message.user?.id];
        return next;
      });
    }
    if (e.type === 'message.updated' && e.channelId === id) {
      refreshMessage(e.parentId ?? e.messageId);
    }
    if (e.type === 'typing' && e.channelId === id) setTyping((t) => ({ ...t, [e.userId]: { name: e.name, at: Date.now() } }));
    if (e.type === 'channel.updated' && e.channelId === id) reloadChannel();
    if (e.type === 'reconnected') load();
  });

  useEffect(() => {
    const t = window.setInterval(() => setTyping((ty) => Object.fromEntries(Object.entries(ty).filter(([, v]) => Date.now() - v.at < 4000))), 2000);
    return () => window.clearInterval(t);
  }, []);

  if (error) return <ErrorState error={error} />;
  if (!channel) return <Loading />;

  const dmName = channel.kind === 'dm' ? channel.members.filter((m) => m.id !== me!.user.id).map((m) => m.name).join(', ') || 'Just you' : channel.name;
  const typingNames = Object.values(typing).map((t) => t.name);

  const actions = {
    forward: (m: Message) => setForwarding(m),
    react: async (m: Message, emoji: string) => {
      // Show the reaction at once; undo it if the server says no.
      const flip = () => setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, reactions: toggleReaction(x.reactions, emoji) } : x)));
      flip();
      if ((await act(() => api.post(`/messages/${m.id}/reactions`, { emoji }))) === undefined) flip();
    },
    pin: async (m: Message) => act(() => api.post(`/messages/${m.id}/pin`), m.pinned ? 'Unpinned' : 'Pinned to channel'),
    save: async (m: Message) => {
      const res = await act(() => api.post<{ saved: boolean }>(`/messages/${m.id}/save`), m.saved ? 'Removed from saved' : 'Saved for later');
      if (res) setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, saved: res.saved } : x)));
    },
    edit: async (m: Message, body: string) => act(() => api.patch(`/messages/${m.id}`, { body })),
    remove: async (m: Message) => {
      if (await confirm({ title: 'Delete this message?', confirmLabel: 'Delete', destructive: true })) await act(() => api.del(`/messages/${m.id}`), 'Message deleted');
    },
    ack: async (m: Message) => act(() => api.post(`/messages/${m.id}/ack`), 'Acknowledged'),
    reply: (m: Message) => setThreadId(m.id),
    task: (m: Message) => setTaskFrom(m),
    decision: (m: Message) => setDecisionFrom(m),
  };

  const panelOpen = !!threadId || !!panel;
  return (
    <div className="flex h-[calc(100dvh-3.5rem-4rem)] min-h-0 md:h-[calc(100dvh-3.5rem)]">
      <MessageScrollerProvider autoScroll defaultScrollPosition="end">
        <section className={cn('flex min-w-0 flex-1 flex-col', panelOpen && 'max-lg:hidden')} aria-label={`Conversation ${dmName}`}>
          <header className="flex flex-wrap items-center gap-2 border-b bg-background px-4 py-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
              <Icon name={channelIcon(channel)} size={16} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <h1 className="truncate font-heading text-base font-semibold">{dmName}</h1>
              <p className="truncate text-xs text-muted-foreground">
                {channel.project && (
                  <Link to={`/projects/${channel.project.id}`} className="inline-flex items-center gap-1 hover:underline">
                    <span className="size-2 rounded-full" style={{ background: `var(--c-${channel.project.color})` }} /> {channel.project.name}
                  </Link>
                )}
                {channel.project && channel.topic && ' · '}
                {channel.topic}
              </p>
            </div>
            <div className="flex items-center gap-0.5">
              <FavoriteButton kind="channel" id={channel.id} />
              <Hint label="Members">
                <Button variant={panel === 'members' ? 'secondary' : 'ghost'} size="sm" onClick={() => setPanel(panel === 'members' ? null : 'members')} aria-label="Members">
                  <Icon name="users" data-icon="inline-start" />
                  <span className="tabular-nums">{channel.members.length}</span>
                </Button>
              </Hint>
              <IconButton label="Pinned messages" variant={panel === 'pins' ? 'secondary' : 'ghost'} size="icon-sm" onClick={() => setPanel(panel === 'pins' ? null : 'pins')}>
                <Icon name="pin" />
              </IconButton>
              <IconButton label="Files" variant={panel === 'files' ? 'secondary' : 'ghost'} size="icon-sm" onClick={() => setPanel(panel === 'files' ? null : 'files')}>
                <Icon name="paperclip" />
              </IconButton>
              {channel.can_post && (
                <IconButton label="Schedule a meeting" size="icon-sm" onClick={() => setMeeting(true)}>
                  <Icon name="video" />
                </IconButton>
              )}
              {channel.kind !== 'dm' && channel.joined && (
                <NativeSelect
                  size="sm"
                  className="ml-1 max-sm:hidden"
                  value={channel.notify}
                  aria-label="Notification preference"
                  onChange={async (e) => {
                    await act(() => api.patch(`/channels/${channel.id}/preferences`, { notify: e.target.value }), 'Notification preference saved');
                    reloadChannel();
                  }}
                >
                  <NativeSelectOption value="all">All activity</NativeSelectOption>
                  <NativeSelectOption value="mentions">Mentions only</NativeSelectOption>
                  <NativeSelectOption value="none">Muted</NativeSelectOption>
                </NativeSelect>
              )}
            </div>
          </header>

          {!channel.joined && channel.kind !== 'dm' && (
            <Callout
              tone="info"
              className="rounded-none border-x-0 border-t-0"
              action={
                <Button
                  size="xs"
                  onClick={async () => {
                    await act(() => api.post(`/channels/${channel.id}/join`), `Joined #${channel.name}`);
                    reloadChannel();
                  }}
                >
                  Join channel
                </Button>
              }
            >
              You are previewing #{channel.name}.
            </Callout>
          )}

          <MessageScroller className="flex-1">
            <MessageScrollerViewport preserveScrollOnPrepend aria-label="Messages">
              <MessageScrollerContent className="gap-0 px-2 py-4 md:px-4">
                <HighlightScroller highlight={highlight} loaded={loaded} exists={messages.some((m) => m.id === highlight)} onThread={setThreadId} />
                {hasMore && (
                  <MessageScrollerItem>
                    <Button variant="outline" size="sm" className="mx-auto mb-4 flex" onClick={() => load(messages[0]?.created_at)}>
                      Load earlier messages
                    </Button>
                  </MessageScrollerItem>
                )}
                {loaded && !messages.length && (
                  <MessageScrollerItem className="my-auto">
                    <EmptyState icon={channelIcon(channel)} title={channel.kind === 'dm' ? `This is the start of your conversation` : `Welcome to #${channel.name}`}>
                      {channel.topic || 'Say hello, share a file or record a decision.'}
                    </EmptyState>
                  </MessageScrollerItem>
                )}
                {!loaded && (
                  <MessageScrollerItem>
                    <Loading />
                  </MessageScrollerItem>
                )}
                {messages.map((m, i) => {
                  const prev = messages[i - 1];
                  const grouped = prev && prev.user?.id === m.user?.id && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60_000;
                  const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
                  return (
                    <MessageScrollerItem key={m.id} messageId={m.id} scrollAnchor={m.user?.id === me!.user.id}>
                      {newDay && (
                        <Marker variant="separator" className="my-3">
                          <MarkerContent>{new Date(m.created_at).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</MarkerContent>
                        </Marker>
                      )}
                      <MessageItem
                        message={m}
                        grouped={!!grouped && !newDay}
                        highlight={m.id === highlight}
                        isAnnouncement={channel.kind === 'announcement'}
                        canPost={channel.can_post}
                        actions={actions}
                        entering={fresh.has(m.id)}
                      />
                    </MessageScrollerItem>
                  );
                })}
                {outgoing.map((o, i) => {
                  const last = i === 0 ? messages[messages.length - 1] : null;
                  const grouped = i > 0 || (!!last && last.user?.id === me!.user.id && Date.now() - new Date(last.created_at).getTime() < 5 * 60_000);
                  return (
                    <MessageScrollerItem key={o.key} scrollAnchor>
                      <OutgoingMessage item={o} grouped={grouped} />
                    </MessageScrollerItem>
                  );
                })}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
          <div className="h-5 px-4 text-xs text-muted-foreground" aria-live="polite">
            {typingNames.length > 0 && <span className="shimmer">{`${typingNames.join(', ')} ${typingNames.length > 1 ? 'are' : 'is'} typing…`}</span>}
          </div>
          {channel.can_post ? (
            <Composer channelId={channel.id} placeholder={channel.kind === 'dm' ? `Message ${dmName}` : `Message #${channel.name}`} members={channel.members} />
          ) : (
            <p className="mx-4 mb-4 rounded-xl border border-dashed p-3 text-center text-sm text-muted-foreground">
              {channel.kind === 'announcement' ? 'Only leads and admins post here. You can reply in threads and acknowledge announcements.' : 'You cannot post in this channel.'}
            </p>
          )}
        </section>
      </MessageScrollerProvider>

      {threadId && (
        <ThreadPanel
          messageId={threadId}
          onClose={() => {
            setThreadId(null);
            if (params.get('message')) setParams({});
          }}
          members={channel.members}
          actions={actions}
          isAnnouncement={channel.kind === 'announcement'}
          aiExcluded={channel.ai_excluded}
        />
      )}
      {!threadId && panel && (
        <SidePanelColumn title={panel === 'members' ? 'Members' : panel === 'pins' ? 'Pinned' : 'Files'} label="Channel details" onClose={() => setPanel(null)}>
          {panel === 'members' && (
            <div className="flex flex-col gap-1">
              {channel.members.map((m) => (
                <Link key={m.id} to={`/people/${m.id}`} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-muted">
                  <Avatar user={m} size="sm" showPresence />
                  <span className="flex min-w-0 flex-1 flex-col text-sm">
                    <strong className="truncate font-medium">{m.name}</strong>
                    <span className="truncate text-xs text-muted-foreground">{m.title || m.role}</span>
                  </span>
                </Link>
              ))}
              <div className="mt-3 flex flex-col gap-2">
                {channel.kind !== 'dm' && me!.role !== 'guest' && channel.joined && (
                  <Button variant="outline" className="w-full" onClick={() => setAdding(true)}>
                    <Icon name="plus" data-icon="inline-start" /> Add people
                  </Button>
                )}
                {channel.kind !== 'dm' && channel.joined && (
                  <Button
                    variant="ghost"
                    className="w-full text-destructive"
                    onClick={async () => {
                      await act(() => api.post(`/channels/${channel.id}/leave`), `Left #${channel.name}`);
                      navigate('/channels');
                    }}
                  >
                    Leave channel
                  </Button>
                )}
              </div>
              {channel.can_manage && channel.kind !== 'dm' && <ChannelSettings channel={channel} onSaved={reloadChannel} />}
            </div>
          )}
          {panel === 'pins' && <PinsList channelId={channel.id} />}
          {panel === 'files' && <FilesList channelId={channel.id} />}
        </SidePanelColumn>
      )}

      <Modal open={!!taskFrom} onClose={() => setTaskFrom(null)} title="Create a task from this message" eyebrow="Turn discussion into delivery">
        {taskFrom && (
          <>
            <blockquote className="mb-4 border-l-2 border-primary/40 pl-3 text-sm text-muted-foreground">{plainMentions(taskFrom.body).slice(0, 300)}</blockquote>
            <NewTaskForm
              endpoint={`/messages/${taskFrom.id}/task`}
              projectId={channel.project?.id}
              defaults={{ title: plainMentions(taskFrom.body).split('\n')[0].slice(0, 200) }}
              onDone={() => setTaskFrom(null)}
            />
          </>
        )}
      </Modal>
      <ForwardModal message={forwarding} onClose={() => setForwarding(null)} />
      <Modal open={!!decisionFrom} onClose={() => setDecisionFrom(null)} title="Record a decision" eyebrow="Decision log">
        {decisionFrom && <DecisionForm message={decisionFrom} onDone={() => setDecisionFrom(null)} />}
      </Modal>
      <Modal open={meeting} onClose={() => setMeeting(false)} title="Schedule a meeting from this channel" wide>
        <NewMeetingForm onDone={() => setMeeting(false)} channelId={channel.id} projectId={channel.project?.id} />
      </Modal>
      <AddMembers open={adding} onClose={() => setAdding(false)} channel={channel} onDone={reloadChannel} />
    </div>
  );
}

/** The column beside a conversation (thread, members, pins, files); full screen on phones. */
function SidePanelColumn({ title, label, onClose, children }: { title: string; label: string; onClose: () => void; children: ReactNode }) {
  return (
    <aside className="flex w-full min-w-0 flex-col border-l bg-card lg:w-96 lg:shrink-0" aria-label={label}>
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="font-heading text-base font-semibold">{title}</h2>
        <IconButton label={label === 'Thread' ? 'Close thread' : 'Close panel'} size="icon-sm" tooltip={false} onClick={onClose}>
          <Icon name="x" />
        </IconButton>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">{children}</div>
    </aside>
  );
}

function ChannelSettings({ channel, onSaved }: { channel: ChannelDetail; onSaved: () => void }) {
  const act = useAction();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [topic, setTopic] = useState(channel.topic);
  return (
    <div className="mt-4 flex flex-col gap-3 border-t pt-4">
      <h3 className="text-sm font-semibold">Channel settings</h3>
      <FormField label="Topic">
        <InputGroup>
          <InputGroupInput value={topic} onChange={(e) => setTopic(e.target.value)} />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="xs"
              onClick={async () => {
                await act(() => api.patch(`/channels/${channel.id}`, { topic }), 'Topic updated');
                onSaved();
              }}
            >
              Save
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </FormField>
      <SwitchField
        label="Allow AI assistance in this channel"
        checked={!channel.ai_excluded}
        onCheckedChange={async (checked) => {
          await act(() => api.patch('/ai/exclusions', { channelId: channel.id, excluded: !checked }), checked ? 'AI assistance allowed' : 'AI assistance turned off here');
          onSaved();
        }}
      />
      <Button
        variant="ghost"
        size="sm"
        className="self-start text-destructive"
        onClick={async () => {
          if (!(await confirm({ title: `Archive #${channel.name}?`, description: 'Messages are kept but no one can post.', confirmLabel: 'Archive', destructive: true }))) return;
          await act(() => api.patch(`/channels/${channel.id}`, { archived: true }), 'Channel archived');
          navigate('/channels');
        }}
      >
        Archive channel
      </Button>
    </div>
  );
}

function AddMembers({ open, onClose, channel, onDone }: { open: boolean; onClose: () => void; channel: ChannelDetail; onDone: () => void }) {
  const { people } = useSession();
  const act = useAction();
  const [ids, setIds] = useState<string[]>([]);
  return (
    <Modal open={open} onClose={onClose} title={`Add people to #${channel.name}`}>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          await act(() => api.post(`/channels/${channel.id}/members`, { userIds: ids }), 'People added');
          setIds([]);
          onClose();
          onDone();
        }}
      >
        <PeoplePicker people={people} value={ids} onChange={setIds} exclude={channel.members.map((m) => m.id)} />
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button disabled={!ids.length} type="submit">
            Add
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function DecisionForm({ message, onDone }: { message: Message; onDone: () => void }) {
  const act = useAction();
  const [title, setTitle] = useState(plainMentions(message.body).split('\n')[0].slice(0, 200));
  const [rationale, setRationale] = useState('');
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await act(() => api.post('/decisions', { title, rationale, messageId: message.id }), 'Decision recorded');
        if (ok) onDone();
      }}
    >
      <FormField label="Decision">
        <Input required value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </FormField>
      <FormField label="Rationale (optional)">
        <Textarea rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder="Why was this decided? What alternatives were considered?" />
      </FormField>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" type="button" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Record decision</Button>
      </div>
    </form>
  );
}

function PinsList({ channelId }: { channelId: string }) {
  const { data } = useApi<Message[]>(`/channels/${channelId}/pins`);
  if (!data) return <LoadingRows rows={3} />;
  if (!data.length) return <p className="p-2 text-sm text-muted-foreground">Nothing pinned yet. Pin important messages from their menu.</p>;
  return (
    <div className="flex flex-col gap-2">
      {data.map((m) => (
        <Link key={m.id} to={`/channels/${channelId}?message=${m.id}`} className="flex flex-col gap-1 rounded-xl border p-3 text-sm hover:bg-muted/60">
          <span className="flex items-baseline gap-2">
            <strong className="font-medium">{m.user?.name}</strong> <span className="text-xs text-muted-foreground">{timeAgo(m.created_at)}</span>
          </span>
          <Markdown text={m.body} compact />
        </Link>
      ))}
    </div>
  );
}

function FilesList({ channelId }: { channelId: string }) {
  const { data } = useApi<{ id: string; name: string; size: number; owner_name: string; created_at: string }[]>(`/channels/${channelId}/files`);
  if (!data) return <LoadingRows rows={3} />;
  if (!data.length) return <p className="p-2 text-sm text-muted-foreground">No files shared here yet.</p>;
  return (
    <div className="flex flex-col gap-1">
      {data.map((f) => (
        <Link key={f.id} to={`/files/${f.id}`} className="flex items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-muted">
          <Icon name="file" size={16} className="text-muted-foreground" />
          <span className="flex min-w-0 flex-1 flex-col text-sm">
            <strong className="truncate font-medium">{f.name}</strong>
            <span className="text-xs text-muted-foreground">
              {f.owner_name} · {bytes(f.size)} · {timeAgo(f.created_at)}
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}

// ======================= Messages =======================

interface Actions {
  forward: (m: Message) => void;
  react: (m: Message, emoji: string) => void;
  pin: (m: Message) => void;
  save: (m: Message) => void;
  edit: (m: Message, body: string) => Promise<unknown>;
  remove: (m: Message) => void;
  ack: (m: Message) => void;
  reply: (m: Message) => void;
  task: (m: Message) => void;
  decision: (m: Message) => void;
}

function MessageItem({
  message: m,
  grouped,
  highlight,
  isAnnouncement,
  canPost,
  actions,
  inThread = false,
  entering = false,
}: {
  message: Message;
  grouped: boolean;
  highlight?: boolean;
  isAnnouncement: boolean;
  canPost: boolean;
  actions: Actions;
  inThread?: boolean;
  /** Arrived while the chat was open: glides in instead of popping in. */
  entering?: boolean;
}) {
  const { me } = useSession();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.body);
  const [picker, setPicker] = useState(false);
  const [menu, setMenu] = useState(false);
  const [remind, setRemind] = useState(false);
  const [poll, setPoll] = useState(m.poll ?? null);
  useEffect(() => setPoll(m.poll ?? null), [m.poll]);
  const mine = m.user?.id === me!.user.id;
  const isAdmin = me!.role === 'admin' || me!.role === 'owner';
  const policy = me!.workspace.message_edit_policy;
  const canEdit = policy === 'author' ? mine : policy === 'admins' ? isAdmin : false;

  if (m.deleted) {
    return (
      <ChatRow className={cn('message deleted py-1', !grouped && 'mt-3')} id={`m-${m.id}`}>
        <MessageAvatar className="size-8 bg-transparent" />
        <MessageContent className="gap-1">
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground italic">
            <Icon name="trash" size={13} /> This message was deleted.
            {m.reply_count > 0 && !inThread && (
              <Button variant="link" size="inline" className="text-xs not-italic" onClick={() => actions.reply(m)}>
                View {m.reply_count} repl{m.reply_count === 1 ? 'y' : 'ies'}
              </Button>
            )}
          </p>
        </MessageContent>
      </ChatRow>
    );
  }

  return (
    <ChatRow
      className={cn(
        'message group/msg rounded-xl px-2 py-1 transition-colors hover:bg-muted/40',
        grouped ? 'grouped' : 'mt-3',
        highlight && 'highlight bg-accent/50 ring-1 ring-primary/30',
        m.urgent && 'urgent',
        entering && 'enter animate-in fade-in-0 slide-in-from-bottom-1',
      )}
      id={`m-${m.id}`}
    >
      <MessageAvatar className={cn('size-8 self-start bg-transparent', grouped && 'h-auto')}>
        {grouped ? (
          <time className="w-8 pt-1 text-center text-[10px] text-muted-foreground opacity-0 group-hover/msg:opacity-100">{timeOf(m.created_at).replace(/\s?[AP]M/i, '')}</time>
        ) : (
          <Avatar user={m.user} size="md" />
        )}
      </MessageAvatar>
      <MessageContent className="gap-1">
        {!grouped && (
          <MessageHeader className="flex flex-wrap items-baseline gap-2">
            <Link to={`/people/${m.user?.id}`} className="text-sm font-semibold text-foreground hover:underline">
              {m.user?.name}
            </Link>
            <time className="text-xs text-muted-foreground" dateTime={m.created_at} title={new Date(m.created_at).toLocaleString()}>
              {timeOf(m.created_at)}
            </time>
            {m.urgent && <Pill tone="danger">Urgent</Pill>}
            {m.pinned && (
              <Pill>
                <Icon name="pin" /> Pinned
              </Pill>
            )}
          </MessageHeader>
        )}
        {editing ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              await actions.edit(m, draft);
              setEditing(false);
            }}
          >
            <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} autoFocus aria-label="Edit message" />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" type="button" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button size="sm" type="submit">
                Save
              </Button>
            </div>
          </form>
        ) : poll ? (
          <PollCard poll={poll} authorId={m.user?.id} onChange={setPoll} />
        ) : (
          m.body && (
            <Bubble variant={mine ? 'tinted' : 'muted'} className={cn('max-w-full', m.urgent && 'ring-1 ring-destructive/40')}>
              <BubbleContent className="rounded-2xl px-3 py-2">
                <Markdown text={m.body} compact />
                {m.edited_at && <span className="ml-1 text-[11px] text-muted-foreground">(edited)</span>}
              </BubbleContent>
            </Bubble>
          )
        )}
        {m.body && !editing && !poll && <VideoLinks text={m.body} />}
        {m.forwarded && <ForwardedQuote f={m.forwarded} />}
        {m.files.length > 0 && (
          <div className="attachments flex flex-wrap gap-2">
            {m.files.map((f) =>
              f.mime?.startsWith('image/') ? (
                <Link key={f.id} to={`/files/${f.id}`} className="block overflow-hidden rounded-xl border">
                  <img src={`/api/files/${f.id}/download?inline=1`} alt={f.name} loading="lazy" className="max-h-64 max-w-xs object-cover" />
                </Link>
              ) : isPlayable(f.mime) ? (
                <MediaAttachment key={f.id} file={f} />
              ) : (
                <Attachment key={f.id} size="sm" className="max-w-xs">
                  <AttachmentTrigger render={<Link to={`/files/${f.id}`} aria-label={f.name} />} />
                  <AttachmentMedia variant="icon">
                    <Icon name="file" />
                  </AttachmentMedia>
                  <AttachmentContent>
                    <AttachmentTitle>{f.name}</AttachmentTitle>
                    <AttachmentDescription>{bytes(f.size)}</AttachmentDescription>
                  </AttachmentContent>
                </Attachment>
              ),
            )}
          </div>
        )}
        {(m.tasks.length > 0 || m.decisions.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {m.tasks.map((t) => (
              <Badge key={t.id} variant="outline" className="h-6 gap-1.5" render={<Link to={`/tasks/${t.id}`} />}>
                <Icon name="task" /> {t.title} <StatusPill status={t.status} />
              </Badge>
            ))}
            {m.decisions.map((d) => (
              <Badge key={d.id} variant="brand" className="h-6 gap-1.5">
                <Icon name="gavel" /> Decision: {d.title}
              </Badge>
            ))}
          </div>
        )}
        {(m.reactions.length > 0 || (isAnnouncement && !inThread)) && (
          <div className="reactions flex flex-wrap gap-1">
            {m.reactions.map((r) => (
              <button
                key={r.emoji}
                className={cn(
                  'reaction inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs tabular-nums transition-colors hover:bg-muted',
                  r.mine && 'mine border-primary/40 bg-accent text-accent-foreground',
                )}
                onClick={() => actions.react(m, r.emoji)}
                aria-pressed={r.mine}
                aria-label={`${r.emoji} ${r.count}`}
              >
                {r.emoji} {r.count}
              </button>
            ))}
            {isAnnouncement && !inThread && !m.parent_id && (
              <button
                className={cn('reaction ack inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs hover:bg-muted disabled:cursor-default', m.acked && 'mine border-success/40 bg-success-soft text-success')}
                onClick={() => !m.acked && actions.ack(m)}
                disabled={m.acked}
              >
                <Icon name="check" size={13} /> {m.acked ? 'Acknowledged' : 'Acknowledge'} · {m.ack_count}
              </button>
            )}
          </div>
        )}
        {m.reply_count > 0 && !inThread && (
          <Button variant="ghost" size="xs" className="self-start text-primary" onClick={() => actions.reply(m)}>
            <Icon name="thread" data-icon="inline-start" /> {m.reply_count} repl{m.reply_count === 1 ? 'y' : 'ies'}
            <span className="font-normal text-muted-foreground">· last {timeAgo(m.last_reply_at)}</span>
          </Button>
        )}
      </MessageContent>
      <div
        className={cn(
          'absolute -top-3 right-2 z-10 flex items-center gap-0.5 rounded-lg border bg-popover p-0.5 shadow-sm transition-opacity',
          picker || menu ? 'opacity-100' : 'opacity-0 group-focus-within/msg:opacity-100 group-hover/msg:opacity-100 max-md:opacity-100',
        )}
        role="toolbar"
        aria-label="Message actions"
      >
        <IconButton label="Add reaction" size="icon-xs" tooltip={false} onClick={() => setPicker((p) => !p)} aria-expanded={picker}>
          <Icon name="smile" />
        </IconButton>
        {!inThread && (
          <IconButton label="Reply in thread" size="icon-xs" tooltip={false} onClick={() => actions.reply(m)}>
            <Icon name="thread" />
          </IconButton>
        )}
        <IconButton label="Create task" size="icon-xs" tooltip={false} onClick={() => actions.task(m)}>
          <Icon name="task" />
        </IconButton>
        <DropdownMenu open={menu} onOpenChange={setMenu}>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label="More actions" />}>
            <Icon name="more" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => actions.forward(m)}>
                <Icon name="forward" /> Forward
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => actions.decision(m)}>
                <Icon name="gavel" /> Record decision
              </DropdownMenuItem>
              {canPost && (
                <DropdownMenuItem onClick={() => actions.pin(m)}>
                  <Icon name="pin" /> {m.pinned ? 'Unpin' : 'Pin to channel'}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => actions.save(m)}>
                <Icon name="bookmark" /> {m.saved ? 'Remove from saved' : 'Save for later'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setRemind(true)}>
                <Icon name="clock" /> Remind me about this
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  navigator.clipboard?.writeText(`${location.origin}/channels/${m.channel_id}?message=${m.parent_id ?? m.id}`);
                  notify('Link copied', 'success');
                }}
              >
                <Icon name="link" /> Copy link
              </DropdownMenuItem>
            </DropdownMenuGroup>
            {((canEdit && !poll) || canEdit || isAdmin) && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  {canEdit && !poll && (
                    <DropdownMenuItem
                      onClick={() => {
                        setDraft(m.body);
                        setEditing(true);
                      }}
                    >
                      <Icon name="edit" /> Edit
                    </DropdownMenuItem>
                  )}
                  {(canEdit || isAdmin) && (
                    <DropdownMenuItem variant="destructive" onClick={() => actions.remove(m)}>
                      <Icon name="trash" /> Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuGroup>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {picker && (
          <div className="absolute top-full right-0 z-20 mt-1 flex gap-0.5 rounded-xl border bg-popover p-1 shadow-md" role="group" aria-label="Pick a reaction">
            {EMOJI.map((e) => (
              <button
                key={e}
                className="flex size-8 items-center justify-center rounded-lg text-lg hover:bg-muted"
                onClick={() => {
                  actions.react(m, e);
                  setPicker(false);
                }}
                aria-label={`React ${e}`}
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
      <RemindModal open={remind} onClose={() => setRemind(false)} messageId={m.id} />
    </ChatRow>
  );
}

/** Add or remove my reaction, as the server does when it is toggled. */
function toggleReaction(reactions: Message['reactions'], emoji: string): Message['reactions'] {
  const r = reactions.find((x) => x.emoji === emoji);
  if (!r) return [...reactions, { emoji, count: 1, mine: true }];
  if (r.mine) return r.count > 1 ? reactions.map((x) => (x === r ? { ...x, count: x.count - 1, mine: false } : x)) : reactions.filter((x) => x !== r);
  return reactions.map((x) => (x === r ? { ...x, count: x.count + 1, mine: true } : x));
}

/** A message on its way to the server: shown at once, faded while sending, with Retry if it couldn't be sent. */
function OutgoingMessage({ item, grouped }: { item: Outgoing; grouped: boolean }) {
  const { me } = useSession();
  const failed = item.status === 'failed';
  return (
    <ChatRow className={cn('message outgoing enter rounded-xl px-2 py-1 animate-in fade-in-0', failed ? 'failed' : 'sending', grouped ? 'grouped' : 'mt-3')} aria-busy={!failed}>
      <MessageAvatar className="size-8 self-start bg-transparent">{grouped ? null : <Avatar user={me!.user} size="md" />}</MessageAvatar>
      <MessageContent className="gap-1">
        {!grouped && (
          <MessageHeader className="flex items-baseline gap-2">
            <span className="text-sm font-semibold">{me!.user.name}</span>
            {item.urgent && <Pill tone="danger">Urgent</Pill>}
          </MessageHeader>
        )}
        {item.body && (
          <Bubble variant={failed ? 'destructive' : 'tinted'} className={cn('max-w-full', !failed && 'opacity-60')}>
            <BubbleContent className="rounded-2xl px-3 py-2">
              <Markdown text={item.body.replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1')} compact />
            </BubbleContent>
          </Bubble>
        )}
        {item.fileNames.length > 0 && (
          <AttachmentGroup className="pending-files">
            {item.fileNames.map((name) => (
              <Attachment key={name} size="xs" state={failed ? 'error' : 'uploading'}>
                <AttachmentMedia variant="icon">
                  <Icon name="file" />
                </AttachmentMedia>
                <AttachmentContent>
                  <AttachmentTitle>{name}</AttachmentTitle>
                </AttachmentContent>
              </Attachment>
            ))}
          </AttachmentGroup>
        )}
        <p className={cn('flex flex-wrap items-center gap-1 text-xs', failed ? 'text-destructive' : 'text-muted-foreground')} role={failed ? 'alert' : 'status'}>
          {failed ? (
            <>
              <Icon name="alert" size={13} /> Not sent{item.error ? `: ${item.error}` : ''}.
              <Button variant="link" size="inline" className="text-xs" onClick={() => outbox.retry(item.key)}>
                Retry
              </Button>
              ·
              <Button
                variant="link"
                size="inline"
                className="text-xs"
                onClick={() => {
                  outbox.discard(item.key);
                  window.dispatchEvent(new CustomEvent('kuu:restore-draft', { detail: { channelId: item.channelId, parentId: item.parentId, body: item.body } }));
                }}
              >
                Edit
              </Button>
              ·
              <Button variant="link" size="inline" className="text-xs" onClick={() => outbox.discard(item.key)}>
                Discard
              </Button>
            </>
          ) : (
            <span className="shimmer">Sending…</span>
          )}
        </p>
      </MessageContent>
    </ChatRow>
  );
}

function ThreadPanel({
  messageId,
  onClose,
  members,
  actions,
  isAnnouncement,
  aiExcluded,
}: {
  messageId: string;
  onClose: () => void;
  members: { id: string; name: string; color: string }[];
  actions: Actions;
  isAnnouncement: boolean;
  aiExcluded: boolean;
}) {
  const { data, error, reload } = useApi<{ root: Message; replies: Message[]; channel: { id: string; name: string } }>(`/messages/${messageId}/thread`);
  const end = useRef<HTMLDivElement>(null);
  const outgoing = useOutbox(data?.root.channel_id, data?.root.id ?? null);
  useEffect(() => outbox.onDelivered((m) => m.parent_id === messageId && reload()), [messageId, reload]);
  useRealtime((e) => {
    if (e.type === 'message.created' && e.message.parent_id === data?.root.id) outbox.settle(e.message);
    if ((e.type === 'message.created' && (e.message.parent_id === data?.root.id || e.message.id === data?.root.id)) || (e.type === 'message.updated' && data && (e.parentId === data.root.id || e.messageId === data.root.id))) reload();
  });
  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [data?.replies.length, outgoing.length]);
  return (
    <SidePanelColumn title="Thread" label="Thread" onClose={onClose}>
      {error && <ErrorState error={error} />}
      {!data && !error && <Loading />}
      {data && (
        <div className="flex min-h-0 flex-1 flex-col">
          {data.replies.length > 0 && <ThreadAi messageId={data.root.id} excluded={aiExcluded} />}
          <div className="flex flex-col">
            <MessageItem message={data.root} grouped={false} isAnnouncement={isAnnouncement} canPost actions={actions} inThread />
            <Marker variant="separator" className="my-3">
              <MarkerContent>
                {data.replies.length} repl{data.replies.length === 1 ? 'y' : 'ies'}
              </MarkerContent>
            </Marker>
            {data.replies.map((r) => (
              <MessageItem key={r.id} message={r} grouped={false} isAnnouncement={false} canPost actions={actions} inThread />
            ))}
            {outgoing.map((o) => (
              <OutgoingMessage key={o.key} item={o} grouped={false} />
            ))}
            <div ref={end} />
          </div>
          <div className="sticky bottom-0 -mx-3 mt-auto -mb-3 bg-card pt-2">
            <Composer channelId={data.root.channel_id} parentId={data.root.id} placeholder="Reply…" members={members} onSent={reload} />
          </div>
        </div>
      )}
    </SidePanelColumn>
  );
}

// ======================= Composer =======================

const BROADCASTS = [
  { id: 'channel', name: 'channel', color: 'gold', hint: 'Notify everyone here' },
  { id: 'here', name: 'here', color: 'gold', hint: 'Notify people online now' },
];

function Composer({
  channelId,
  parentId,
  placeholder,
  members,
  onSent,
}: {
  channelId: string;
  parentId?: string;
  placeholder: string;
  members: { id: string; name: string; color: string }[];
  onSent?: () => void;
}) {
  const { people } = useSession();
  const act = useAction();
  const storageKey = `softex.draft.${channelId}.${parentId ?? 'root'}`;
  const [enterSends, setEnterSends] = useEnterSends();
  const [text, setText] = useState(() => {
    try {
      return localStorage.getItem(storageKey) ?? '';
    } catch {
      return '';
    }
  });
  const [mentions, setMentions] = useState<Record<string, string>>({});
  const [query, setQuery] = useState<string | null>(null);
  const [files, setFiles] = useState<{ id: string; name: string; preview?: string; kind?: 'image' | 'video' }[]>([]);
  const [urgent, setUrgent] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [later, setLater] = useState(false);
  const [polling, setPolling] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastTyping = useRef(0);

  useEffect(() => {
    try {
      if (text) localStorage.setItem(storageKey, text);
      else localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  }, [text, storageKey]);

  // "Edit" on a message that failed to send puts its text back here.
  useEffect(() => {
    const onRestore = (e: Event) => {
      const d = (e as CustomEvent<{ channelId: string; parentId: string | null; body: string }>).detail;
      if (d.channelId !== channelId || d.parentId !== (parentId ?? null)) return;
      setText((current) => (current.trim() ? `${current}\n${d.body}` : d.body));
      window.setTimeout(() => ref.current?.focus(), 0);
    };
    window.addEventListener('kuu:restore-draft', onRestore);
    return () => window.removeEventListener('kuu:restore-draft', onRestore);
  }, [channelId, parentId]);

  const candidates = useMemo(() => {
    if (query === null) return [];
    const pool = [...members, ...people.filter((p) => !members.some((m) => m.id === p.id))];
    const found = pool.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6);
    // @channel and @here notify everyone in the conversation (everyone, or those online now).
    const everyone = members.length > 2 ? BROADCASTS.filter((b) => b.name.startsWith(query.toLowerCase())) : [];
    return [...found, ...everyone].slice(0, 7);
  }, [query, members, people]);

  const onChange = (value: string) => {
    setText(value);
    const caret = ref.current?.selectionStart ?? value.length;
    const match = value.slice(0, caret).match(/(?:^|\s)@([\w.-]*)$/);
    setQuery(match ? match[1] : null);
    if (Date.now() - lastTyping.current > 3000) {
      lastTyping.current = Date.now();
      realtime.send({ type: 'typing', channelId });
    }
  };

  const pick = (p: { id: string; name: string }) => {
    const caret = ref.current?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@([\w.-]*)$/, `@${p.name} `);
    setText(before + text.slice(caret));
    if (!BROADCASTS.some((b) => b.id === p.id)) setMentions((m) => ({ ...m, [p.name]: p.id }));
    setQuery(null);
    window.setTimeout(() => ref.current?.focus(), 0);
  };

  // The message shows in the chat at once (see outbox.ts) and the box is ready for the next one; a failed send
  // stays in the chat with Retry, so nothing typed is lost.
  const send = () => {
    if (!text.trim() && !files.length) return;
    let body = text.trim();
    for (const [name, id] of Object.entries(mentions)) body = body.split(`@${name}`).join(`@[${name}](${id})`);
    outbox.send({ channelId, parentId: parentId ?? null, body, fileIds: files.map((f) => f.id), fileNames: files.map((f) => f.name), urgent });
    setText('');
    for (const f of files) if (f.preview) URL.revokeObjectURL(f.preview);
    setFiles([]);
    setMentions({});
    setUrgent(false);
    setQuery(null);
    onSent?.();
    ref.current?.focus();
  };

  const schedule = async (sendAt: string) => {
    let body = text.trim();
    for (const [name, id] of Object.entries(mentions)) body = body.split(`@${name}`).join(`@[${name}](${id})`);
    const ok = await act(() => api.post(`/channels/${channelId}/scheduled-messages`, { body, parentId, sendAt }), 'Message scheduled. Find it under Later.');
    if (ok) {
      setText('');
      setMentions({});
    }
    return ok;
  };

  const upload = async (file: File) => {
    setUploading(true);
    const form = new FormData();
    form.append('file', file);
    form.append('channelId', channelId);
    const res = await act(() => api.upload<{ id: string; name: string }>('/files', form));
    setUploading(false);
    // Show a preview of images and videos while the message is being written.
    const preview = /^(image|video)\//.test(file.type) ? URL.createObjectURL(file) : undefined;
    if (res) setFiles((f) => [...f, { id: res.id, name: res.name, preview, kind: file.type.startsWith('video/') ? 'video' : 'image' }]);
    else if (preview) URL.revokeObjectURL(preview);
  };

  return (
    <div
      className="composer relative mx-3 mb-3 md:mx-4 md:mb-4"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) upload(file);
      }}
    >
      {candidates.length > 0 && (
        <div className="absolute bottom-full left-0 z-20 mb-1 flex w-72 flex-col rounded-xl border bg-popover p-1 shadow-md" role="listbox" aria-label="Mention someone">
          {candidates.map((p, i) => (
            <button
              key={p.id}
              role="option"
              aria-selected={i === 0}
              className={cn('flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted', i === 0 && 'bg-muted')}
              onMouseDown={(e) => (e.preventDefault(), pick(p))}
            >
              {'hint' in p ? (
                <>
                  <Icon name="megaphone" size={14} /> @{p.name} <span className="text-xs text-muted-foreground">{String(p.hint)}</span>
                </>
              ) : (
                <>
                  <Avatar user={p} size="xs" /> {p.name}
                </>
              )}
            </button>
          ))}
        </div>
      )}
      <InputGroup className="h-auto flex-col items-stretch rounded-2xl bg-card shadow-sm">
        {files.length > 0 && (
          <AttachmentGroup className="pending-files px-2 pt-2">
            {files.map((f) => (
              <Attachment key={f.id} size="sm" state="done">
                <AttachmentMedia variant={f.preview ? 'image' : 'icon'}>
                  {f.preview ? (
                    f.kind === 'video' ? (
                      <video className="pending-thumb size-full object-cover" src={`${f.preview}#t=0.1`} muted playsInline preload="metadata" aria-hidden="true" />
                    ) : (
                      <img className="pending-thumb size-full object-cover" src={f.preview} alt="" />
                    )
                  ) : (
                    <Icon name="file" />
                  )}
                </AttachmentMedia>
                <AttachmentContent>
                  <AttachmentTitle>{f.name}</AttachmentTitle>
                </AttachmentContent>
                <AttachmentActions>
                  <AttachmentAction
                    aria-label={`Remove ${f.name}`}
                    onClick={() => {
                      if (f.preview) URL.revokeObjectURL(f.preview);
                      setFiles(files.filter((x) => x.id !== f.id));
                    }}
                  >
                    <Icon name="x" />
                  </AttachmentAction>
                </AttachmentActions>
              </Attachment>
            ))}
          </AttachmentGroup>
        )}
        <InputGroupTextarea
          ref={ref}
          value={text}
          rows={Math.min(8, Math.max(1, text.split('\n').length))}
          placeholder={placeholder}
          aria-label={placeholder}
          className="max-h-60 min-h-11 resize-none"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !(e.nativeEvent as KeyboardEvent).isComposing) {
              if (candidates.length && !e.shiftKey) {
                e.preventDefault();
                pick(candidates[0]);
                return;
              }
              // Ctrl/⌘+Enter always sends; plain Enter sends only when "Enter to send" is on. Otherwise Enter is a new line.
              if (e.ctrlKey || e.metaKey || (enterSends && !e.shiftKey)) {
                e.preventDefault();
                send();
              }
            }
            if (e.key === 'Escape') setQuery(null);
          }}
        />
        {/* The tools wrap onto a second line on narrow screens; the send button always stays in view. */}
        <InputGroupAddon align="block-end" className="flex-wrap gap-1 border-t">
          <IconButton label="Attach a file" size="icon-xs" onClick={() => fileInput.current?.click()} disabled={uploading}>
            {uploading ? <Spinner /> : <Icon name="paperclip" />}
          </IconButton>
          <input ref={fileInput} type="file" hidden onChange={(e) => e.target.files?.[0] && (upload(e.target.files[0]), (e.target.value = ''))} />
          <VoiceNoteButton onRecorded={upload} disabled={uploading} />
          <IconButton label="Create a poll" size="icon-xs" onClick={() => setPolling(true)}>
            <Icon name="poll" />
          </IconButton>
          <IconButton label="Mention someone" size="icon-xs" onClick={() => onChange(`${text}${text && !text.endsWith(' ') ? ' ' : ''}@`)}>
            <span className="text-sm font-semibold">@</span>
          </IconButton>
          <Separator orientation="vertical" className="mx-1 h-4" />
          <Label className={cn('h-6 gap-1.5 rounded-md px-1.5 text-xs font-normal', urgent && 'bg-destructive/10 text-destructive')} title="Urgent messages break through quiet hours and focus time">
            <Checkbox checked={urgent} onCheckedChange={(checked) => setUrgent(checked)} /> Urgent
          </Label>
          <Label className="h-6 gap-1.5 px-1.5 text-xs font-normal" title={enterSends ? 'Shift+Enter starts a new line' : 'Ctrl+Enter (⌘+Enter on a Mac) sends'}>
            <Checkbox checked={enterSends} onCheckedChange={(checked) => setEnterSends(checked)} /> Enter to send
          </Label>
          <span className="truncate text-xs text-muted-foreground max-lg:hidden">{enterSends ? 'Shift+Enter for a new line' : 'Ctrl+Enter to send'} · **bold**, *italic*, `code`</span>
          <span className="ml-auto flex items-center gap-1">
            <IconButton label={files.length ? 'Attachments cannot be scheduled' : 'Send later'} size="icon-xs" onClick={() => setLater(true)} disabled={!text.trim() || files.length > 0}>
              <Icon name="clock" />
            </IconButton>
            <InputGroupButton variant="default" size="icon-sm" className="send rounded-xl" onClick={send} disabled={uploading || (!text.trim() && !files.length)} aria-label="Send">
              <Icon name="send" />
            </InputGroupButton>
          </span>
        </InputGroupAddon>
      </InputGroup>
      <WhenModal open={later} onClose={() => setLater(false)} eyebrow="Send later" title="Schedule this message" confirmLabel="Schedule" onPick={schedule} />
      <PollModal open={polling} onClose={() => setPolling(false)} channelId={channelId} parentId={parentId} onSent={onSent} />
    </div>
  );
}
