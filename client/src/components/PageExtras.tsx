import { useState } from 'react';
import { api } from '../api';
import { timeAgo } from '../format';
import { useApi, useRealtime } from '../hooks';
import { useSession } from '../session';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { Markdown } from './Markdown';
import { IconButton, Modal, Pill, useAction, useConfirm, useToast } from '@/components/kit';
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const EMOJI = ['📄', '📘', '📋', '📌', '✅', '💡', '🚀', '🎯', '📊', '🗂️', '🛠️', '🔒', '📣', '🤝', '🏥', '🎓', '💰', '🌍', '⚖️', '🧭', '🌱', '🏗️', '🧾', '🗓️'];

/** Choose an emoji for a page, Notion-style. */
export function IconPicker({ value, onChange }: { value: string | null; onChange: (icon: string | null) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="ghost" className={cn('size-12 p-0 text-3xl', !value && 'text-muted-foreground')} aria-label={value ? 'Change page icon' : 'Add page icon'} />
        }
      >
        {value ?? <Icon name="smile" size={22} />}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <div className="grid grid-cols-6 gap-1" role="listbox" aria-label="Page icon">
          {EMOJI.map((e) => (
            <button
              key={e}
              type="button"
              role="option"
              aria-selected={e === value}
              className={cn('flex size-9 items-center justify-center rounded-lg text-xl hover:bg-muted', e === value && 'bg-accent')}
              onClick={() => {
                onChange(e);
                setOpen(false);
              }}
            >
              {e}
            </button>
          ))}
        </div>
        {value && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 w-full text-muted-foreground"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            Remove icon
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

interface PageComment {
  id: string;
  body: string;
  created_at: string;
  resolved_at: string | null;
  user_id: string;
  user_name: string;
  user_color: string;
}

/** Discussion under a page, with @mentions and resolve. */
export function PageComments({ pageId, canModerate, onChange }: { pageId: string; canModerate: boolean; onChange?: () => void }) {
  const act = useAction();
  const confirm = useConfirm();
  const { me, people } = useSession();
  const { data, reload } = useApi<PageComment[]>(`/pages/${pageId}/comments`);
  const [body, setBody] = useState('');
  const [showResolved, setShowResolved] = useState(false);
  useRealtime((e) => e.type === 'page.comment' && e.pageId === pageId && reload());
  const open = (data ?? []).filter((c) => !c.resolved_at);
  const resolved = (data ?? []).filter((c) => c.resolved_at);
  // "@Name" typed in the box becomes a mention when it matches someone in the workspace.
  const withMentions = (text: string) =>
    people.reduce((t, p) => t.replace(new RegExp(`@${p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), `@[${p.name}](${p.id})`), text);
  const list = showResolved ? [...open, ...resolved] : open;

  return (
    <Card className="page-comments" id="comments">
      <CardHeader>
        <CardTitle>Comments</CardTitle>
        {resolved.length > 0 && (
          <CardAction>
            <Button variant="ghost" size="sm" onClick={() => setShowResolved((s) => !s)}>
              {showResolved ? 'Hide resolved' : `Show ${resolved.length} resolved`}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!list.length && <p className="text-sm text-muted-foreground">No comments yet. Ask a question or suggest a change.</p>}
        {list.map((c) => (
          <div key={c.id} className={cn('flex gap-2.5', c.resolved_at && 'opacity-60')}>
            <Avatar user={{ id: c.user_id, name: c.user_name, color: c.user_color }} size="sm" />
            <div className="min-w-0 flex-1 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="font-semibold">{c.user_name}</strong> <span className="text-xs text-muted-foreground">{timeAgo(c.created_at)}</span>
                {c.resolved_at && <Pill tone="success">Resolved</Pill>}
              </div>
              <Markdown text={c.body} compact />
            </div>
            <div className="flex shrink-0 items-start gap-1">
              {(canModerate || c.user_id === me!.user.id) && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={async () => {
                    await act(() => api.patch(`/page-comments/${c.id}`, { resolved: !c.resolved_at }));
                    reload();
                  }}
                >
                  {c.resolved_at ? 'Reopen' : 'Resolve'}
                </Button>
              )}
              {(c.user_id === me!.user.id || me!.role === 'admin' || me!.role === 'owner') && (
                <IconButton
                  label="Delete comment"
                  size="icon-xs"
                  onClick={async () => {
                    if (!(await confirm({ title: 'Delete this comment?', confirmLabel: 'Delete', destructive: true }))) return;
                    await act(() => api.del(`/page-comments/${c.id}`));
                    reload();
                    onChange?.();
                  }}
                >
                  <Icon name="x" />
                </IconButton>
              )}
            </div>
          </div>
        ))}
      </CardContent>
      <CardFooter>
        <form
          className="flex w-full items-center gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!body.trim()) return;
            const ok = await act(() => api.post(`/pages/${pageId}/comments`, { body: withMentions(body.trim()) }));
            if (!ok) return;
            setBody('');
            reload();
            onChange?.();
          }}
        >
          <Avatar user={me!.user} size="sm" />
          <Input className="flex-1" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Comment… use @Name to mention someone" aria-label="Comment on this page" maxLength={5000} />
          <Button variant="outline" size="sm" disabled={!body.trim()} type="submit">
            Post
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}

/** Publish a page as a read-only web link anyone can open. */
export function PublishPanel({ open, onClose, pageId, isPublic, url, onChange }: { open: boolean; onClose: () => void; pageId: string; isPublic: boolean; url: string | null; onChange: () => void }) {
  const act = useAction();
  const toast = useToast();
  const set = async (makePublic: boolean, newLink = false) => {
    await act(() => api.post(`/pages/${pageId}/publish`, { public: makePublic, newLink }), makePublic ? (newLink ? 'New link created' : 'Page published') : 'Page unpublished');
    onChange();
  };
  return (
    <Modal open={open} onClose={onClose} title="Publish to the web" eyebrow="Share">
      <div className="flex flex-col gap-3">
        <p className="text-muted-foreground">
          Anyone with the link can read this page — no Küü account needed. They can’t see comments, history or other pages. Search engines are asked not to index it.
        </p>
        {isPublic && url ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Input readOnly value={url} aria-label="Public link" onFocus={(e) => e.target.select()} className="min-w-0 flex-1" />
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(url);
                    toast('Link copied');
                  } catch {
                    /* the field is selectable */
                  }
                }}>
                Copy
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button variant="outline" onClick={() => set(true, true)}>
                New link
              </Button>
              <Button variant="ghost" className="text-destructive" onClick={() => set(false)}>
                Unpublish
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button onClick={() => set(true)}>
              <Icon name="globe" data-icon="inline-start" /> Publish
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
