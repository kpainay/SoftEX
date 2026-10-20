import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useLiveDoc, useYText, type Peer, type SaveStatus } from '../collab';
import { useRealtime } from '../hooks';
import { AvatarStack } from './Avatar';
import { Markdown } from './Markdown';
import { Loading, useAction } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

const STATUS_TEXT: Record<SaveStatus, string> = {
  connecting: 'Connecting…',
  saving: 'Sharing changes…',
  saved: 'Changes shared live',
  offline: 'Offline — your changes will be shared when you reconnect',
};

export function PeerList({ peers, label = 'Also editing' }: { peers: Peer[]; label?: string }) {
  // One entry per person, even with several tabs open.
  const people = [...new Map(peers.map((p) => [p.user.id, p.user])).values()];
  if (!people.length) return null;
  return (
    <span className="inline-flex items-center gap-2" aria-label={`${label}: ${people.map((p) => p.name).join(', ')}`}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <AvatarStack users={people} max={5} />
    </span>
  );
}

/**
 * The page editor: title and Markdown body are shared live with everyone editing the page.
 * "Save version" records the shared text in the page's history and makes it the published copy.
 */
export function LiveEditor({
  page,
  onClose,
  onSaved,
}: {
  page: { id: string; title: string; body: string; version: number };
  onClose: () => void;
  onSaved: () => void;
}) {
  const act = useAction();
  const live = useLiveDoc('page', page.id);
  const title = useYText(live, 'title');
  const body = useYText(live, 'body');
  const [preview, setPreview] = useState(false);

  if (!live || !live.ready) return <Loading label="Opening the live editor" />;
  const changed = title.value !== page.title || body.value !== page.body;
  const peers = [...live.peers.values()];
  const others = (field: 'title' | 'body') => peers.filter((p) => p.selection?.field === field);
  const track = (field: 'title' | 'body') => (e: { currentTarget: HTMLInputElement | HTMLTextAreaElement }) =>
    live.setPresence({ selection: { field, start: e.currentTarget.selectionStart ?? 0, end: e.currentTarget.selectionEnd ?? 0 } });

  const dot = live.status === 'offline' ? 'bg-destructive' : live.status === 'saved' ? 'bg-success' : 'animate-pulse bg-warning';
  return (
    <Card className="editor">
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <Badge variant="outline" role="status" className={cn('gap-1.5', live.status === 'offline' && 'text-destructive')}>
          <i className={cn('size-1.5 rounded-full', dot)} aria-hidden="true" /> {STATUS_TEXT[live.status]}
        </Badge>
        <PeerList peers={peers} />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Input
          ref={title.ref}
          className="h-11 font-heading text-xl font-semibold md:text-xl"
          value={title.value}
          onChange={(e) => title.onChange(e.target.value)}
          onSelect={track('title')}
          readOnly={!live.canEdit}
          aria-label="Page title"
        />
        {others('title').length > 0 && <PeerList peers={others('title')} label="In the title" />}
        <Tabs value={preview ? 'preview' : 'write'} onValueChange={(v) => setPreview(v === 'preview')}>
          <TabsList>
            <TabsTrigger value="write">Write</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>
        </Tabs>
        {preview ? (
          <div className="min-h-64 rounded-xl border p-4">
            <Markdown text={body.value} />
          </div>
        ) : (
          <Textarea
            ref={body.ref}
            className="min-h-96 font-mono text-sm leading-relaxed"
            value={body.value}
            onChange={(e) => body.onChange(e.target.value)}
            onSelect={track('body')}
            readOnly={!live.canEdit}
            rows={20}
            aria-label="Page content"
            placeholder={'# Heading\n\nWrite with **Markdown**. Link tasks and discussions by pasting their Küü links.\n\n- [ ] Checklists work too'}
          />
        )}
        <p className="text-xs text-muted-foreground">Everyone editing sees each other’s changes as they type. Readers see the last saved version until someone saves.</p>
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          {changed ? 'Close (keep shared draft)' : 'Close'}
        </Button>
        <Button
          disabled={!changed || !title.value.trim() || !live.canEdit}
          onClick={async () => {
            await live.flush();
            const ok = await act(() => api.patch(`/pages/${page.id}`, { title: title.value.trim(), body: body.value }), 'Page saved');
            if (ok) onSaved();
          }}
        >
          Save version {page.version + (changed ? 1 : 0)}
        </Button>
      </CardFooter>
    </Card>
  );
}

/** People editing a page right now, for readers of the saved version. */
export function useEditingNow(pageId: string) {
  const [peers, setPeers] = useState<Map<string, Peer>>(new Map());
  useRealtime((e) => {
    if (e.type !== 'collab.presence' || e.key !== `page:${pageId}`) return;
    setPeers((prev) => {
      const next = new Map(prev);
      if (e.active) next.set(e.clientId, { clientId: e.clientId, user: e.user, cursor: null, selection: e.selection, at: Date.now() });
      else next.delete(e.clientId);
      return next;
    });
  });
  useEffect(() => {
    // Only a change re-renders: a new Map every tick would redraw the open page every 10 seconds.
    const t = window.setInterval(
      () =>
        setPeers((prev) => {
          const live = [...prev].filter(([, p]) => p.at > Date.now() - 30_000);
          return live.length === prev.size ? prev : new Map(live);
        }),
      10_000,
    );
    return () => window.clearInterval(t);
  }, []);
  return useMemo(() => [...peers.values()], [peers]);
}
