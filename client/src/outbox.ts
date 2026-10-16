import { useMemo, useSyncExternalStore } from 'react';
import { api, ApiError, type Message } from './api';

/**
 * Messages on their way to the server. They show in the chat the moment they're sent (faded while sending)
 * and are swapped for the real message once the server has it, so sending never leaves the screen waiting.
 */
export interface Outgoing {
  key: string;
  channelId: string;
  parentId: string | null;
  body: string;
  fileIds: string[];
  fileNames: string[];
  urgent: boolean;
  createdAt: string;
  status: 'sending' | 'failed';
  error?: string;
}

let items: Outgoing[] = [];
const listeners = new Set<() => void>();
const deliveredListeners = new Set<(message: Message, key: string) => void>();
let counter = 0;

const emit = () => listeners.forEach((l) => l());
const set = (next: Outgoing[]) => {
  items = next;
  emit();
};
const patch = (key: string, change: Partial<Outgoing>) => set(items.map((o) => (o.key === key ? { ...o, ...change } : o)));

async function deliver(key: string) {
  const item = items.find((o) => o.key === key);
  if (!item) return;
  patch(key, { status: 'sending', error: undefined });
  try {
    const message = await api.post<Message>(`/channels/${item.channelId}/messages`, {
      body: item.body,
      parentId: item.parentId,
      fileIds: item.fileIds,
      urgent: item.urgent,
    });
    set(items.filter((o) => o.key !== key));
    deliveredListeners.forEach((l) => l(message, key));
  } catch (e) {
    // A server answer explains itself; anything else means the server couldn't be reached.
    patch(key, { status: 'failed', error: e instanceof ApiError ? e.message : 'no connection to Küü' });
  }
}

export const outbox = {
  /** Show a message straight away and send it. */
  send(input: Omit<Outgoing, 'key' | 'createdAt' | 'status'>) {
    const key = `out-${Date.now().toString(36)}-${counter++}`;
    set([...items, { ...input, key, createdAt: new Date().toISOString(), status: 'sending' }]);
    void deliver(key);
    return key;
  },
  retry: (key: string) => void deliver(key),
  discard: (key: string) => set(items.filter((o) => o.key !== key)),
  /**
   * The server's copy of one of our messages arrived over the socket before the send finished:
   * drop the matching outgoing one so it isn't shown twice. Returns whether one matched.
   */
  settle(message: Message) {
    const match = items.find((o) => o.status === 'sending' && o.channelId === message.channel_id && o.parentId === message.parent_id && o.body === message.body);
    if (match) set(items.filter((o) => o !== match));
    return !!match;
  },
  onDelivered(fn: (message: Message, key: string) => void) {
    deliveredListeners.add(fn);
    return () => void deliveredListeners.delete(fn);
  },
};

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

/** Outgoing messages for one chat (or one thread, with its parent id). */
export function useOutbox(channelId: string | undefined, parentId: string | null = null) {
  const all = useSyncExternalStore(subscribe, () => items);
  return useMemo(() => all.filter((o) => o.channelId === channelId && o.parentId === parentId), [all, channelId, parentId]);
}
