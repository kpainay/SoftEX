import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, qs } from '../api';
import { dateTime, plainMentions, timeAgo } from '../format';
import { useDebounced } from '../hooks';
import { usePeople, useSession } from '../session';
import { useAiEnabled } from './Ai';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { Pill, StatusPill } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Command, CommandDialog, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

interface AskResult {
  question: string;
  answer: string;
  sources: { n: number; type: string; title: string; link: string; snippet: string; date: string | null }[];
}

/** Sources the answer cites, or all of them when it cites none. */
function citedSources(a: AskResult) {
  const cited = new Set([...a.answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
  return cited.size ? a.sources.filter((s) => cited.has(s.n)) : a.sources;
}

const SOURCE_ICON: Record<string, string> = { message: 'chat', page: 'book', decision: 'gavel', task: 'task', file: 'file', meeting: 'video' };

type SearchType = 'all' | 'messages' | 'tasks' | 'projects' | 'pages' | 'files' | 'people' | 'decisions' | 'meetings';
const TYPES: { id: SearchType; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'messages', label: 'Messages' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'pages', label: 'Knowledge' },
  { id: 'files', label: 'Files' },
  { id: 'projects', label: 'Projects' },
  { id: 'decisions', label: 'Decisions' },
  { id: 'meetings', label: 'Meetings' },
  { id: 'people', label: 'People' },
];

/** In "All", each group shows this many results before "Show more". */
const FOLD_AT = 4;
/** How many results per group "All" fetches, so a group can be opened up without searching again. */
const ALL_LIMIT = 20;

function ResultItem({ value, onSelect, media, title, meta, snippet, end }: { value: string; onSelect: () => void; media: ReactNode; title: ReactNode; meta?: ReactNode; snippet?: ReactNode; end?: ReactNode }) {
  return (
    <CommandItem value={value} onSelect={onSelect} className="items-start gap-3 py-2">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center text-muted-foreground">{media}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2 truncate font-medium">{title}</span>
        {meta && <span className="truncate text-xs text-muted-foreground">{meta}</span>}
        {snippet && <span className="line-clamp-2 text-xs text-muted-foreground">{snippet}</span>}
      </span>
      {end}
    </CommandItem>
  );
}

export function SearchDialog({ open, initial, onClose }: { open: boolean; initial: string; onClose: () => void }) {
  const navigate = useNavigate();
  const people = usePeople();
  const [q, setQ] = useState(initial);
  const [type, setType] = useState<SearchType>('all');
  const [from, setFrom] = useState('');
  const [hasFile, setHasFile] = useState(false);
  const [results, setResults] = useState<Record<string, any[]> | null>(null);
  // Groups the person opened up to see past the first few results.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const debounced = useDebounced(q, 200);
  const aiEnabled = useAiEnabled();
  const [ask, setAsk] = useState<AskResult | { question: string; loading: true } | { question: string; error: string } | null>(null);

  const runAsk = async () => {
    const question = q.trim();
    if (question.length < 3) return;
    setAsk({ question, loading: true });
    try {
      const res = await api.post<Omit<AskResult, 'question'>>('/ai/ask', { question });
      setAsk({ question, ...res });
    } catch (e) {
      setAsk({ question, error: (e as Error).message });
    }
  };

  useEffect(() => {
    if (open) {
      setQ(initial);
      setAsk(null);
    }
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    if (debounced.trim().length < 2 && !from && !hasFile) {
      setResults(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .get(`/search${qs({ q: debounced.trim(), type, from, hasFile: hasFile ? 'true' : undefined, limit: type === 'all' ? ALL_LIMIT : 25 })}`)
      .then((r) => {
        if (cancelled) return;
        setResults(r);
        setExpanded(new Set());
      })
      .catch(() => !cancelled && setResults(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [debounced, type, from, hasFile, open]);

  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  const total = results ? Object.values(results).reduce((n, list) => n + list.length, 0) : 0;
  // In "All", a group with more than a few results shows the first few and can be opened up.
  const section = (key: string, title: string, render: (item: any) => ReactNode) => {
    const list = results?.[key] ?? [];
    if (!list.length) return null;
    const folded = type === 'all' && list.length > FOLD_AT && !expanded.has(key);
    const more = list.length - FOLD_AT;
    return (
      <CommandGroup heading={`${title} · ${list.length}${type === 'all' && list.length >= ALL_LIMIT ? '+' : ''}`} key={key}>
        {(folded ? list.slice(0, FOLD_AT) : list).map(render)}
        {folded && (
          <CommandItem value={`more-${key}`} onSelect={() => setExpanded(new Set(expanded).add(key))} className="justify-center py-1.5 text-xs font-medium text-primary">
            <Icon name="chevronDown" size={14} /> Show {more}
            {list.length >= ALL_LIMIT ? '+' : ''} more {title.toLowerCase()}
          </CommandItem>
        )}
      </CommandGroup>
    );
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title="Search"
      description="Search messages, tasks, files, knowledge and people"
      className="top-[12dvh] w-[calc(100%-1.5rem)] sm:max-w-2xl"
    >
      <Command
        shouldFilter={false}
        className="rounded-none"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && aiEnabled && (e.shiftKey || q.trim().endsWith('?'))) {
            e.preventDefault();
            runAsk();
          }
        }}
      >
        <CommandInput
          value={q}
          onValueChange={setQ}
          autoFocus
          placeholder={aiEnabled ? 'Search, or ask a question ending with “?”' : 'Search messages, tasks, files, knowledge and people…'}
          aria-label="Search"
        />
        <div className="flex flex-wrap items-center gap-2 border-b px-2 py-2">
          <ToggleGroup
            value={[type]}
            onValueChange={(v) => v[0] && setType(v[0] as SearchType)}
            variant="outline"
            size="sm"
            spacing={1}
            className="flex-wrap"
            aria-label="Search in"
          >
            {TYPES.map((t) => (
              <ToggleGroupItem key={t.id} value={t.id} className="h-6 rounded-full px-2.5 text-xs">
                {t.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {(type === 'messages' || type === 'all' || type === 'tasks') && (
            <NativeSelect size="sm" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From person">
              <NativeSelectOption value="">Anyone</NativeSelectOption>
              {people.map((p) => (
                <NativeSelectOption key={p.id} value={p.id}>
                  {p.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
          {(type === 'messages' || type === 'all') && (
            <Label className="text-xs font-normal">
              <Checkbox checked={hasFile} onCheckedChange={(v) => setHasFile(!!v)} /> Has attachment
            </Label>
          )}
          {loading && <Spinner className="ml-auto text-muted-foreground" aria-label="Searching" />}
        </div>
        {ask && (
          <section className="flex max-h-72 flex-col gap-2 overflow-y-auto border-b bg-accent/40 px-4 py-3 text-sm" aria-live="polite">
            <header className="flex items-center gap-2 font-medium">
              <Icon name="spark" size={14} className="text-primary" /> {ask.question}
            </header>
            {'loading' in ask && (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Spinner /> <span className="shimmer">Reading what you have access to…</span>
              </p>
            )}
            {'error' in ask && <p className="text-destructive">{ask.error}</p>}
            {'answer' in ask && (
              <>
                {ask.answer.split(/\n{2,}/).map((para, i) => (
                  <p key={i}>
                    {para.split(/(\[\d+\])/g).map((part, j) => {
                      const m = part.match(/^\[(\d+)\]$/);
                      const src = m ? ask.sources.find((s) => s.n === Number(m[1])) : undefined;
                      return src ? (
                        <Badge key={j} variant="brand" className="mx-0.5 cursor-pointer align-super" render={<button type="button" onClick={() => go(src.link)} title={src.title} />}>
                          {src.n}
                        </Badge>
                      ) : (
                        <span key={j}>{part}</span>
                      );
                    })}
                  </p>
                ))}
                {ask.sources.length > 0 && (
                  <ol className="flex flex-col gap-1">
                    {citedSources(ask).map((s) => (
                      <li key={s.n} className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="brand">{s.n}</Badge>
                        <Button variant="link" size="inline" onClick={() => go(s.link)}>
                          <Icon name={SOURCE_ICON[s.type] ?? 'file'} /> {s.title}
                        </Button>
                        {s.date && <span className="text-xs text-muted-foreground">· {timeAgo(s.date)}</span>}
                      </li>
                    ))}
                  </ol>
                )}
                <p className="text-xs text-muted-foreground">AI answer — check the sources before relying on it. Only you can see this.</p>
              </>
            )}
          </section>
        )}
        <CommandList className="max-h-[min(60dvh,28rem)] px-1 pb-1">
          {aiEnabled && q.trim().length >= 3 && (!ask || ask.question !== q.trim()) && (
            <CommandGroup>
              <ResultItem
                value="ask"
                onSelect={runAsk}
                media={<Icon name="spark" className="text-primary" />}
                title={`Ask Küü: “${q.trim()}”`}
                meta="Get an answer with sources from messages, knowledge, decisions and files you can access. Shift+Enter"
              />
            </CommandGroup>
          )}
          {!results && <p className="px-3 py-6 text-center text-sm text-muted-foreground">Type at least two characters. Results only include items you have access to.</p>}
          {results && total === 0 && !loading && <p className="px-3 py-6 text-center text-sm text-muted-foreground">No results for “{debounced}”.</p>}
          {section('pages', 'Knowledge', (p) => (
            <ResultItem
              key={p.id}
              value={`page-${p.id}`}
              onSelect={() => go(`/knowledge/${p.id}`)}
              media={<Icon name="book" />}
              title={
                <>
                  <span className="truncate">{p.title}</span>
                  {p.status === 'approved' && <Pill tone="success">Approved</Pill>}
                </>
              }
              meta={`${p.owner_name} · ${p.review_date ? `review ${p.review_date}` : `updated ${timeAgo(p.updated_at)}`}`}
              snippet={p.snippet && `…${p.snippet.replace(/[#*_>`]/g, '').replace(/\s+/g, ' ')}…`}
            />
          ))}
          {section('messages', 'Messages', (m) => (
            <ResultItem
              key={m.id}
              value={`message-${m.id}`}
              onSelect={() => go(`/channels/${m.channel_id}?message=${m.parent_id ?? m.id}`)}
              media={<Avatar user={{ name: m.user_name, color: m.user_color }} size="sm" />}
              title={
                <>
                  {m.user_name} <span className="text-xs font-normal text-muted-foreground">in {m.channel_kind === 'dm' ? 'direct message' : `#${m.channel_name}`}</span>
                </>
              }
              snippet={plainMentions(m.body).slice(0, 180)}
              meta={timeAgo(m.created_at)}
            />
          ))}
          {section('tasks', 'Tasks', (t) => (
            <ResultItem
              key={t.id}
              value={`task-${t.id}`}
              onSelect={() => go(`/tasks/${t.id}`)}
              media={<Icon name="task" />}
              title={t.title}
              meta={`${t.project?.name ?? 'Personal'} · ${t.owner?.name ?? 'Unassigned'}`}
              end={<StatusPill status={t.status} />}
            />
          ))}
          {section('decisions', 'Decisions', (d) => (
            <ResultItem
              key={d.id}
              value={`decision-${d.id}`}
              onSelect={() => go(d.project_id ? `/projects/${d.project_id}?tab=decisions` : '/decisions')}
              media={<Icon name="gavel" />}
              title={d.title}
              meta={`${d.decided_by_name} · ${d.project_name ?? 'Workspace'} · ${timeAgo(d.created_at)}`}
            />
          ))}
          {section('files', 'Files', (f) => (
            <ResultItem
              key={f.id}
              value={`file-${f.id}`}
              onSelect={() => go(`/files/${f.id}`)}
              media={<Icon name={f.external_url ? 'link' : 'file'} />}
              title={f.name}
              meta={`${f.owner_name} · ${timeAgo(f.updated_at)}`}
              snippet={f.snippet && `…${f.snippet}…`}
            />
          ))}
          {section('projects', 'Projects', (p) => (
            <ResultItem
              key={p.id}
              value={`project-${p.id}`}
              onSelect={() => go(`/projects/${p.id}`)}
              media={
                <span className="flex size-6 items-center justify-center rounded-md text-white" style={{ background: `var(--c-${p.color})` }}>
                  <Icon name="folder" size={14} />
                </span>
              }
              title={p.name}
              meta={p.description?.slice(0, 100)}
            />
          ))}
          {section('meetings', 'Meetings', (m) => (
            <ResultItem key={m.id} value={`meeting-${m.id}`} onSelect={() => go(`/meetings/${m.id}`)} media={<Icon name="video" />} title={m.title} meta={dateTime(m.starts_at)} />
          ))}
          {section('people', 'People', (p) => (
            <ResultItem
              key={p.id}
              value={`person-${p.id}`}
              onSelect={() => go(`/people/${p.id}`)}
              media={<Avatar user={p} size="sm" />}
              title={p.name}
              meta={[p.title, ...(p.expertise ?? [])].filter(Boolean).join(' · ')}
            />
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
