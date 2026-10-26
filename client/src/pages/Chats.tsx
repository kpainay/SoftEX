import { memo, useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode, type RefObject } from 'react';
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
import { usePeople, useSession } from '../session';
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

/**
 * The message whose actions are showing on a touch screen. Phones have no hover, so tapping a message selects it
 * (and tapping anywhere else clears it); only the two messages whose selection changed re-render.
 */
let selectedMessage: string | null = null;
const selectionListeners = new Set<() => void>();
const selectMessage = (id: string | null) => {
  if (id === selectedMessage) return;
  selectedMessage = id;
  selectionListeners.forEach((l) => l());
};
const subscribeSelection = (fn: () => void) => {
  selectionListeners.add(fn);
  return () => void selectionListeners.delete(fn);
};
const useMessageSelected = (id: string) => useSyncExternalStore(subscribeSelection, () => selectedMessage === id);
const canHover = () => window.matchMedia?.('(hover: hover)').matches ?? true;

/** Taps on these inside a message do their own thing instead of selecting the message. */
const INTERACTIVE = 'a, button, input, textarea, select, label, video, audio, [role="menuitem"], [role="toolbar"]';

/** One object whose functions always call the latest ones, so memoised message rows don't re-render for new closures. */
function useStableActions<T extends Record<string, (...args: never[]) => unknown>>(fns: T): T {
  const latest = useRef(fns);
  latest.current = fns;
  return useMemo(
    () => Object.fromEntries(Object.keys(fns).map((k) => [k, (...args: never[]) => latest.current[k](...args)])) as T,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
}

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
  const { me } = useSession();
  const people = usePeople();
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

/** Many new messages since you were last here: a button to go back to the first of them. */
function JumpToUnread({ from, count }: { from: string; count: number }) {
  const { scrollToMessage } = useMessageScroller();
  const [gone, setGone] = useState(false);
  if (gone) return null;
  return (
    <Button
      size="sm"
      variant="secondary"
      className="absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-full border shadow-md"
      onClick={() => {
        scrollToMessage(from, { align: 'start' });
        setGone(true);
      }}
    >
      <Icon name="chevronDown" className="rotate-180" data-icon="inline-start" /> {count} new message{count === 1 ? '' : 's'}
    </Button>
  );
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

/**
 * Chat rows are drawn in full rather than skipped while off screen: skipping clips the actions bar that sits over
 * the row's top edge, and the guessed sizes of skipped rows made the jump to the latest message land short.
 */
const CHAT_ITEM = '[content-visibility:visible]';

/**
 * Inside the scroller: sending a message brings you to the bottom to see it, even when you'd scrolled up.
 * (A message from someone else only scrolls the chat if you're already at the bottom.)
 */
function ScrollOnSend({ count }: { count: number }) {
  const { scrollToEnd } = useMessageScroller();
  const previous = useRef(count);
  useEffect(() => {
    if (count > previous.current) scrollToEnd({ behavior: 'auto' });
    previous.current = count;
  }, [count, scrollToEnd]);
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
  const [panel, setPanel] = useState<'details' | 'members' | 'pins' | 'files' | null>(null);
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
  // Where unread messages began when you opened the chat (or from where you marked it unread): a "New" line goes there.
  const [unread, setUnread] = useState<{ from: string; count: number } | null>(null);
  const load = async (before?: string) => {
    const res = await api.get<{ messages: Message[]; has_more: boolean; last_read_at: string | null }>(`/channels/${id}/messages${qs({ before, limit: 50 })}`);
    setHasMore(res.has_more);
    setMessages((prev) => (before ? [...res.messages, ...prev] : res.messages));
    setLoaded(true);
    if (!before && res.last_read_at) {
      const fresh = res.messages.filter((m) => m.created_at > res.last_read_at! && m.user?.id !== me!.user.id && !m.deleted);
      setUnread(fresh.length ? { from: fresh[0].id, count: fresh.length } : null);
    }
  };

  useEffect(() => {
    setMessages([]);
    setFresh(new Set());
    setLoaded(false);
    setThreadId(null);
    setUnread(null);
    // Marked read once loaded, so the load still knows what was new.
    load()
      .catch(() => setLoaded(true))
      .finally(() => api.post(`/channels/${id}/read`).catch(() => {}));
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
    // Only a change re-renders: a fresh object every tick would redraw the whole conversation every 2 seconds.
    const t = window.setInterval(
      () =>
        setTyping((ty) => {
          const live = Object.entries(ty).filter(([, v]) => Date.now() - v.at < 4000);
          return live.length === Object.keys(ty).length ? ty : Object.fromEntries(live);
        }),
      2000,
    );
    return () => window.clearInterval(t);
  }, []);

  // On a touch screen, tapping outside the selected message hides its actions again.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (selectedMessage && !(e.target as Element | null)?.closest?.(`[data-message-row="${selectedMessage}"]`)) selectMessage(null);
    };
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      selectMessage(null);
    };
  }, []);

  const actions = useStableActions({
    markUnread: async (m: Message) => {
      if (await act(() => api.post(`/channels/${m.channel_id}/unread`, { messageId: m.id }), 'Marked unread from here')) {
        const after = messages.filter((x) => x.created_at >= m.created_at && !x.deleted);
        setUnread({ from: after[0]?.id ?? m.id, count: after.length || 1 });
      }
    },
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
  });

  if (error) return <ErrorState error={error} />;
  if (!channel) return <Loading />;

  const dmName = channel.kind === 'dm' ? channel.members.filter((m) => m.id !== me!.user.id).map((m) => m.name).join(', ') || 'Just you' : channel.name;
  const typingNames = Object.values(typing).map((t) => t.name);

  const panelOpen = !!threadId || !!panel;
  return (
    <div className="flex h-[calc(100dvh-3.5rem-4rem)] min-h-0 md:h-[calc(100dvh-3.5rem)]">
      {/* Keyed by chat, so switching chats starts each one at its latest message instead of where the last one was. */}
      <MessageScrollerProvider key={id} autoScroll defaultScrollPosition="end">
        <section className={cn('flex min-w-0 flex-1 flex-col', panelOpen && 'max-lg:hidden')} aria-label={`Conversation ${dmName}`}>
          <header className="flex flex-wrap items-center gap-2 border-b bg-background px-4 py-2.5">
            {/* The name and topic open the channel's details: members, files, tasks, meetings. */}
            <div className="relative -my-1 -ml-1.5 flex min-w-0 flex-1 items-center gap-2 rounded-xl px-1.5 py-1 transition-colors hover:bg-muted has-[>button:focus-visible]:ring-2 has-[>button:focus-visible]:ring-ring">
              <button
                type="button"
                onClick={() => setPanel(panel === 'details' ? null : 'details')}
                aria-expanded={panel === 'details'}
                aria-label={`Details for ${channel.kind === 'dm' ? dmName : `#${channel.name}`}`}
                className="absolute inset-0 rounded-xl outline-none"
              />
              <span className="pointer-events-none flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                <Icon name={channelIcon(channel)} size={16} />
              </span>
              <div className="pointer-events-none flex min-w-0 flex-1 flex-col">
                <h1 className="flex items-center gap-1 font-heading text-base font-semibold">
                  <span className="truncate">{dmName}</span>
                  <Icon name="chevronRight" size={14} className="shrink-0 text-muted-foreground" />
                </h1>
                <p className="truncate text-xs text-muted-foreground">
                  {channel.project && (
                    <span className="inline-flex items-center gap-1">
                      <span className="size-2 rounded-full" style={{ background: `var(--c-${channel.project.color})` }} /> {channel.project.name}
                    </span>
                  )}
                  {channel.project && channel.topic && ' · '}
                  {channel.topic}
                </p>
              </div>
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
              {/* Outside the item list: older messages then go in above the first message, which keeps its place on screen. */}
              {hasMore && (
                <Button variant="outline" size="sm" className="mx-auto mt-4 flex" onClick={() => load(messages[0]?.created_at)}>
                  Load earlier messages
                </Button>
              )}
              <MessageScrollerContent className="gap-0 px-2 py-4 md:px-4">
                <HighlightScroller highlight={highlight} loaded={loaded} exists={messages.some((m) => m.id === highlight)} onThread={setThreadId} />
                <ScrollOnSend count={outgoing.length} />
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
                    <MessageScrollerItem key={m.id} messageId={m.id} className={CHAT_ITEM}>
                      {newDay && (
                        <Marker variant="separator" className="my-3">
                          <MarkerContent>{new Date(m.created_at).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</MarkerContent>
                        </Marker>
                      )}
                      {unread?.from === m.id && (
                        <div id="new-messages" role="separator" aria-label="New messages" className="my-2 flex items-center gap-2 text-xs font-semibold text-destructive">
                          <span className="h-px flex-1 bg-destructive/50" /> New <span className="h-px w-6 bg-destructive/50" />
                        </div>
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
                    <MessageScrollerItem key={o.key} className={CHAT_ITEM}>
                      <OutgoingMessage item={o} grouped={grouped} />
                    </MessageScrollerItem>
                  );
                })}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
            {unread && unread.count > 4 && <JumpToUnread from={unread.from} count={unread.count} />}
          </MessageScroller>
          <div className="h-5 px-4 text-xs text-muted-foreground" aria-live="polite">
            {typingNames.length > 0 && <span className="shimmer">{`${typingNames.join(', ')} ${typingNames.length > 1 ? 'are' : 'is'} typing…`}</span>}
          </div>
          {channel.can_post ? (
            <Composer
              channelId={channel.id}
              placeholder={channel.kind === 'dm' ? `Message ${dmName}` : `Message #${channel.name}`}
              members={channel.members}
              onEditLast={() => {
                // ↑ in an empty box: edit your last message here.
                const mine = [...messages].reverse().find((x) => x.user?.id === me!.user.id && !x.deleted && !x.poll);
                if (mine) window.dispatchEvent(new CustomEvent('kuu:edit-message', { detail: mine.id }));
              }}
            />
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
        <SidePanelColumn
          title={panel === 'details' ? (channel.kind === 'dm' ? 'Chat details' : 'Channel details') : panel === 'members' ? 'Members' : panel === 'pins' ? 'Pinned' : 'Files'}
          label="Channel details"
          onClose={() => setPanel(null)}
          onBack={panel === 'details' ? undefined : () => setPanel('details')}
        >
          {panel === 'details' && (
            <ChannelOverview
              channel={channel}
              name={dmName}
              onOpen={setPanel}
              onAddPeople={channel.kind !== 'dm' && me!.role !== 'guest' && channel.joined ? () => setAdding(true) : undefined}
              onLeave={
                channel.kind !== 'dm' && channel.joined
                  ? async () => {
                      await act(() => api.post(`/channels/${channel.id}/leave`), `Left #${channel.name}`);
                      navigate('/channels');
                    }
                  : undefined
              }
              settings={channel.can_manage && channel.kind !== 'dm' ? <ChannelSettings channel={channel} onSaved={reloadChannel} /> : null}
            />
          )}
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
/**
 * Keep a scrolling list on its newest item: when it opens, when items arrive, and while images and previews
 * finish loading and grow the list — unless the reader has scrolled up to read older items.
 */
function useStayAtEnd(end: RefObject<HTMLElement | null>, ready: boolean, count: number) {
  const stick = useRef(true);
  const toEnd = useRef<() => void>(() => {});
  useEffect(() => {
    const list = end.current?.parentElement;
    let scroller = list?.parentElement ?? null;
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    if (!list || !scroller) return;
    const box = scroller;
    toEnd.current = () => (box.scrollTop = box.scrollHeight);
    const onScroll = () => (stick.current = box.scrollHeight - box.scrollTop - box.clientHeight < 80);
    const grew = new ResizeObserver(() => stick.current && toEnd.current());
    grew.observe(list);
    box.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      grew.disconnect();
      box.removeEventListener('scroll', onScroll);
    };
  }, [end, ready]);
  // Opening the list, or a new item in it (yours or someone else's), brings the newest item into view.
  useEffect(() => {
    stick.current = true;
    toEnd.current();
  }, [ready, count]);
}

function SidePanelColumn({ title, label, onClose, onBack, children }: { title: string; label: string; onClose: () => void; onBack?: () => void; children: ReactNode }) {
  return (
    <aside className="flex w-full min-w-0 flex-col border-l bg-card lg:w-96 lg:shrink-0" aria-label={label}>
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        {onBack && (
          <IconButton label="Back to details" size="icon-sm" tooltip={false} onClick={onBack} className="-ml-2">
            <Icon name="chevronLeft" />
          </IconButton>
        )}
        <h2 className="mr-auto font-heading text-base font-semibold">{title}</h2>
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
  const people = usePeople();
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

interface ChannelOverviewData {
  created_by: { id: string; name: string; color: string } | null;
  created_at: string;
  file_count: number;
  pin_count: number;
  tasks: { id: string; title: string; status: string; due_date: string | null; owner: { id: string; name: string; color: string } | null }[];
  meetings: { id: string; title: string; starts_at: string; ends_at: string }[];
}

const KIND_LABEL: Record<string, string> = { public: 'Public channel', private: 'Private channel', announcement: 'Announcements', dm: 'Direct message' };

/** One part of the details panel, with an optional "See all". */
function OverviewSection({ title, count, onAll, children }: { title: string; count?: number; onAll?: () => void; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5 border-b py-3 last:border-b-0" aria-label={title}>
      <div className="flex items-center gap-2 px-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        {count !== undefined && <span className="text-xs text-muted-foreground tabular-nums">{count}</span>}
        {onAll && (
          <Button variant="link" size="inline" className="ml-auto text-xs" onClick={onAll}>
            See all
          </Button>
        )}
      </div>
      {children}
    </section>
  );
}

/** Everything about a channel or chat: what it's for, who's in it, and the files, tasks and meetings that came out of it. */
function ChannelOverview({
  channel,
  name,
  onOpen,
  onAddPeople,
  onLeave,
  settings,
}: {
  channel: ChannelDetail;
  name: string;
  onOpen: (panel: 'members' | 'pins' | 'files') => void;
  onAddPeople?: () => void;
  onLeave?: () => void;
  settings: ReactNode;
}) {
  const { data } = useApi<ChannelOverviewData>(`/channels/${channel.id}/overview`);
  const { data: files } = useApi<{ id: string; name: string; size: number; owner_name: string; created_at: string }[]>(`/channels/${channel.id}/files`);
  const shownMembers = channel.members.slice(0, 6);
  return (
    <div className="flex flex-col">
      <section className="flex flex-col gap-2 border-b pb-3" aria-label="About">
        <div className="flex items-center gap-3 px-1">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
            <Icon name={channelIcon(channel)} size={20} />
          </span>
          <div className="flex min-w-0 flex-col">
            <strong className="truncate font-heading text-base">{name}</strong>
            <span className="text-xs text-muted-foreground">{KIND_LABEL[channel.kind] ?? channel.kind}</span>
          </div>
        </div>
        {channel.topic && <p className="px-1 text-sm">{channel.topic}</p>}
        {channel.project && (
          <Link to={`/projects/${channel.project.id}`} className="inline-flex items-center gap-1.5 self-start rounded-lg px-1 text-sm hover:underline">
            <span className="size-2 rounded-full" style={{ background: `var(--c-${channel.project.color})` }} /> {channel.project.name}
          </Link>
        )}
        {data && channel.kind !== 'dm' && (
          <p className="px-1 text-xs text-muted-foreground">
            Created{data.created_by ? ` by ${data.created_by.name}` : ''} on {new Date(data.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        )}
      </section>

      <OverviewSection title="Members" count={channel.members.length} onAll={channel.members.length > shownMembers.length ? () => onOpen('members') : undefined}>
        <div className="flex flex-col">
          {shownMembers.map((m) => (
            <Link key={m.id} to={`/people/${m.id}`} className="flex items-center gap-2.5 rounded-xl px-1 py-1 hover:bg-muted">
              <Avatar user={m} size="sm" showPresence />
              <span className="min-w-0 flex-1 truncate text-sm">{m.name}</span>
              <span className="truncate text-xs text-muted-foreground">{m.title || m.role}</span>
            </Link>
          ))}
        </div>
        {onAddPeople && (
          <Button variant="outline" size="sm" className="mt-1" onClick={onAddPeople}>
            <Icon name="plus" data-icon="inline-start" /> Add people
          </Button>
        )}
      </OverviewSection>

      <OverviewSection title="Files" count={data?.file_count} onAll={(files?.length ?? 0) > 3 ? () => onOpen('files') : undefined}>
        {!files && <LoadingRows rows={2} />}
        {files && !files.length && <p className="px-1 text-sm text-muted-foreground">No files shared here yet.</p>}
        {files?.slice(0, 3).map((f) => (
          <Link key={f.id} to={`/files/${f.id}`} className="flex items-center gap-2.5 rounded-xl px-1 py-1 hover:bg-muted">
            <Icon name="file" size={16} className="shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
            <span className="text-xs text-muted-foreground">{timeAgo(f.created_at)}</span>
          </Link>
        ))}
      </OverviewSection>

      <OverviewSection title="Tasks" count={data?.tasks.length}>
        {!data && <LoadingRows rows={2} />}
        {data && !data.tasks.length && <p className="px-1 text-sm text-muted-foreground">No tasks yet. Turn a message into a task from its menu.</p>}
        {data?.tasks.map((t) => (
          <Link key={t.id} to={`/tasks/${t.id}`} className="flex items-center gap-2.5 rounded-xl px-1 py-1 hover:bg-muted">
            <Icon name={t.status === 'done' ? 'check' : 'task'} size={16} className="shrink-0 text-muted-foreground" />
            <span className={cn('min-w-0 flex-1 truncate text-sm', t.status === 'done' && 'text-muted-foreground line-through')}>{t.title}</span>
            {t.owner && <Avatar user={t.owner} size="xs" />}
          </Link>
        ))}
      </OverviewSection>

      <OverviewSection title="Meetings" count={data?.meetings.length}>
        {!data && <LoadingRows rows={1} />}
        {data && !data.meetings.length && <p className="px-1 text-sm text-muted-foreground">No meetings scheduled from here.</p>}
        {data?.meetings.map((m) => (
          <Link key={m.id} to={`/meetings/${m.id}`} className="flex items-center gap-2.5 rounded-xl px-1 py-1 hover:bg-muted">
            <Icon name="calendar" size={16} className="shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-sm">{m.title}</span>
            <time className="shrink-0 text-xs text-muted-foreground" dateTime={m.starts_at}>
              {new Date(m.starts_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </time>
          </Link>
        ))}
      </OverviewSection>

      <OverviewSection title="Pinned" count={data?.pin_count} onAll={data?.pin_count ? () => onOpen('pins') : undefined}>
        {data && !data.pin_count && <p className="px-1 text-sm text-muted-foreground">Nothing pinned.</p>}
      </OverviewSection>

      {settings}
      {onLeave && (
        <Button variant="ghost" className="mt-3 w-full text-destructive" onClick={onLeave}>
          Leave channel
        </Button>
      )}
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
  markUnread: (m: Message) => void;
}

/** Memoised: a chat redraws only the rows that changed, not every message whenever anything in the chat changes. */
const MessageItem = memo(function MessageItem({
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
  // ↑ in the message box asks the last message you wrote to open for editing.
  useEffect(() => {
    const onEdit = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== m.id) return;
      setDraft(m.body);
      setEditing(true);
    };
    window.addEventListener('kuu:edit-message', onEdit);
    return () => window.removeEventListener('kuu:edit-message', onEdit);
  }, [m.id, m.body]);
  const [picker, setPicker] = useState(false);
  const [menu, setMenu] = useState(false);
  const [remind, setRemind] = useState(false);
  const [poll, setPoll] = useState(m.poll ?? null);
  useEffect(() => setPoll(m.poll ?? null), [m.poll]);
  const selected = useMessageSelected(m.id);
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
        'message group/msg rounded-xl px-2 py-1 transition-colors hover:bg-muted/40 data-selected:bg-muted/60',
        grouped ? 'grouped' : 'mt-3',
        highlight && 'highlight bg-accent/50 ring-1 ring-primary/30',
        m.urgent && 'urgent',
        entering && 'enter animate-in fade-in-0 slide-in-from-bottom-1',
      )}
      id={`m-${m.id}`}
      data-message-row={m.id}
      data-selected={selected || undefined}
      onClick={(e) => {
        // Touch screens: a tap on the message (not on a link or button in it) shows or hides its actions.
        if (canHover() || editing || (e.target as Element).closest(INTERACTIVE)) return;
        selectMessage(selected ? null : m.id);
      }}
    >
      <MessageAvatar className={cn('size-8 self-start bg-transparent', grouped && 'h-auto')}>
        {grouped ? (
          <time className="w-8 pt-1 text-center text-[10px] text-muted-foreground opacity-0 group-hover/msg:opacity-100 group-data-selected/msg:opacity-100">{timeOf(m.created_at).replace(/\s?[AP]M/i, '')}</time>
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
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              autoFocus
              aria-label="Edit message"
              // Esc cancels; Ctrl/⌘+Enter saves (plain Enter is a new line, as in the message box with "Enter to send" off).
              onKeyDown={(e) => {
                if (e.key === 'Escape') (e.preventDefault(), setEditing(false));
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) (e.preventDefault(), e.currentTarget.form?.requestSubmit());
              }}
              onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
            />
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
            <Bubble variant={mine ? 'tinted' : 'muted'} className="max-w-full">
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
          // Hidden bars can't be tapped by accident; they show on hover, keyboard focus, or a tap on the message (touch).
          picker || menu
            ? 'opacity-100'
            : 'pointer-events-none opacity-0 group-focus-within/msg:pointer-events-auto group-focus-within/msg:opacity-100 group-hover/msg:pointer-events-auto group-hover/msg:opacity-100 group-data-selected/msg:pointer-events-auto group-data-selected/msg:opacity-100',
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
              <DropdownMenuItem onClick={() => actions.markUnread(m)}>
                <Icon name="inbox" /> Mark unread from here
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
});

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
  useStayAtEnd(end, !!data, (data?.replies.length ?? 0) + outgoing.length);
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
  onEditLast,
}: {
  channelId: string;
  parentId?: string;
  placeholder: string;
  members: { id: string; name: string; color: string }[];
  onSent?: () => void;
  /** ↑ in an empty box: edit the last message you wrote. */
  onEditLast?: () => void;
}) {
  const people = usePeople();
  const act = useAction();
  const { data: teams } = useApi<{ id: string; name: string }[]>('/teams');
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
    // @Team notifies everyone on a team (who can see this conversation) and goes to the team's inbox.
    const groups = (teams ?? [])
      .filter((t) => t.name.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 3)
      .map((t) => ({ id: `team:${t.id}`, name: t.name, color: 'gold', team: true as const }));
    return [...found, ...groups, ...everyone].slice(0, 8);
  }, [query, members, people, teams]);

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
              ) : 'team' in p ? (
                <>
                  <Icon name="users" size={14} /> @{p.name} <span className="text-xs text-muted-foreground">Notify the team</span>
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
            if (e.key === 'ArrowUp' && !text && !candidates.length && onEditLast && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
              e.preventDefault();
              onEditLast();
            }
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
