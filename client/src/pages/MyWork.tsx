import { useState } from 'react';
import { api, type Task } from '../api';
import { Icon } from '../components/Icon';
import { useShell } from '../components/Layout';
import { TaskRow } from '../components/TaskDrawer';
import { QuickAddTask } from '../components/QuickAddTask';
import { ChevronRight } from 'lucide-react';
import { DatePicker, EmptyState, ErrorState, Loading, Page, PageHeader, Pill, notify, useAction } from '@/components/kit';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { usePeople, useSession } from '../session';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { cn } from '@/lib/utils';
import { localToday } from '../format';
import { useApi, useRealtime } from '../hooks';
import { Button } from '@/components/ui/button';

interface MyWorkData {
  overdue: Task[];
  today: Task[];
  upcoming: Task[];
  later: Task[];
  blocked: Task[];
  review: Task[];
  done_recently: Task[];
  /** Given to one of your teams and not picked up yet. */
  team: Task[];
}

const SECTIONS: { id: keyof MyWorkData; title: string; hint: string; tone?: string }[] = [
  { id: 'overdue', title: 'Overdue', hint: 'Past their due date', tone: 'danger' },
  { id: 'today', title: 'Today', hint: 'Due today or urgent' },
  { id: 'blocked', title: 'Blocked', hint: 'Waiting on something', tone: 'warn' },
  { id: 'review', title: 'Assigned for review', hint: 'Waiting on your review' },
  { id: 'team', title: 'For your teams', hint: 'Given to a team you are on — anyone can take it' },
  { id: 'upcoming', title: 'Next 7 days', hint: 'Coming up soon' },
  { id: 'later', title: 'Later', hint: 'No date or further out' },
  { id: 'done_recently', title: 'Done recently', hint: 'Completed in the last day' },
];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const inDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return iso(d);
};
/** Next Monday (or the one after, if today is Monday). */
const nextMonday = () => inDays(((8 - new Date().getDay()) % 7) || 7);

type Patch = { status?: string; dueDate?: string | null; ownerId?: string | null };

/**
 * Apply one change to several tasks, a few at a time, through the normal task update (so permissions,
 * notifications and automations all still apply). Says how it went, with Undo.
 */
async function applyToAll(tasks: Task[], patch: Patch, done: string, reload: () => void) {
  const before = new Map(tasks.map((t) => [t.id, { status: t.status, dueDate: t.due_date, ownerId: t.owner?.id ?? null }]));
  const run = async (list: Task[], change: (t: Task) => Patch) => {
    let failed = 0;
    for (let i = 0; i < list.length; i += 5) {
      const results = await Promise.allSettled(list.slice(i, i + 5).map((t) => api.patch(`/tasks/${t.id}`, change(t))));
      failed += results.filter((r) => r.status === 'rejected').length;
    }
    return failed;
  };
  const failed = await run(tasks, () => patch);
  reload();
  if (failed === tasks.length) return notify(`Couldn't change ${failed === 1 ? 'that task' : 'those tasks'}`, 'error');
  const changed = tasks.length - failed;
  notify(`${changed} task${changed === 1 ? '' : 's'} ${done}`, failed ? 'warning' : 'success', {
    description: failed ? `${failed} couldn't be changed — you may not have access.` : undefined,
    action: {
      label: 'Undo',
      onClick: async () => {
        await run(tasks, (t) => {
          const was = before.get(t.id)!;
          return Object.fromEntries(Object.keys(patch).map((k) => [k, was[k as keyof Patch]])) as Patch;
        });
        reload();
      },
    },
  });
}

/** What can be done to the chosen tasks: finish, reschedule or hand them over. */
function BulkBar({ tasks, onClear, reload }: { tasks: Task[]; onClear: () => void; reload: () => void }) {
  const people = usePeople();
  const { me } = useSession();
  const [busy, setBusy] = useState(false);
  const apply = async (patch: Patch, done: string) => {
    setBusy(true);
    await applyToAll(tasks, patch, done, reload);
    setBusy(false);
    onClear();
  };
  return (
    <div
      role="toolbar"
      aria-label={`${tasks.length} selected tasks`}
      className="fixed inset-x-3 bottom-20 z-30 mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-2xl border bg-popover p-2 shadow-lg md:bottom-6"
    >
      <span className="px-2 text-sm font-medium tabular-nums">{tasks.length} selected</span>
      <Button size="sm" disabled={busy || !tasks.length} onClick={() => apply({ status: 'done' }, 'completed')}>
        <Icon name="check" data-icon="inline-start" /> Done
      </Button>
      <Button size="sm" variant="outline" disabled={busy || !tasks.length} onClick={() => apply({ dueDate: inDays(0) }, 'moved to today')}>
        Today
      </Button>
      <Button size="sm" variant="outline" disabled={busy || !tasks.length} onClick={() => apply({ dueDate: inDays(1) }, 'moved to tomorrow')}>
        Tomorrow
      </Button>
      <Button size="sm" variant="outline" disabled={busy || !tasks.length} onClick={() => apply({ dueDate: nextMonday() }, 'moved to next week')}>
        Next week
      </Button>
      <DatePicker value={null} onChange={(v) => v && apply({ dueDate: v }, `moved to ${v}`)} placeholder="Pick a date" aria-label="Move to a date" disabled={busy || !tasks.length} />
      <NativeSelect
        size="sm"
        value=""
        aria-label="Assign to"
        disabled={busy || !tasks.length}
        onChange={(e) => {
          const person = people.find((p) => p.id === e.target.value);
          if (person) apply({ ownerId: person.id }, `given to ${person.id === me!.user.id ? 'you' : person.name}`);
        }}
      >
        <NativeSelectOption value="">Assign to…</NativeSelectOption>
        {people.map((p) => (
          <NativeSelectOption key={p.id} value={p.id}>
            {p.id === me!.user.id ? `${p.name} (me)` : p.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <span className="flex-1" />
      <Button size="sm" variant="ghost" onClick={onClear}>
        Cancel
      </Button>
    </div>
  );
}

export function MyWork() {
  const { openTask } = useShell();
  const act = useAction();
  const { data, error, reload } = useApi<MyWorkData>('/my-work');
  const [due, setDue] = useState(localToday());
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ done_recently: true });
  // Choosing several tasks to finish, reschedule or hand over at once.
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const stopSelecting = () => {
    setSelecting(false);
    setPicked(new Set());
  };
  useRealtime((e) => (e.type === 'task.updated' || e.type === 'reconnected') && reload());

  const toggle = async (t: Task, done: boolean) => {
    await act(() => api.patch(`/tasks/${t.id}`, { status: done ? 'done' : 'todo' }), done ? 'Nice work — task completed' : 'Task reopened');
    // Waited for, so the ticked box doesn't flick back before the fresh list arrives.
    await reload();
  };

  if (error) return <ErrorState error={error} retry={reload} />;
  if (!data) return <Loading />;
  const total = SECTIONS.filter((s) => s.id !== 'done_recently').reduce((n, s) => n + (data[s.id] ?? []).length, 0);

  return (
    <Page width="narrow">
      <PageHeader
        title="My work"
        description="Everything you own or need to review, across every project."
        actions={
          total > 0 && (
            <Button variant={selecting ? 'secondary' : 'outline'} onClick={() => (selecting ? stopSelecting() : setSelecting(true))} aria-pressed={selecting}>
              <Icon name="check" data-icon="inline-start" /> {selecting ? 'Done selecting' : 'Select'}
            </Button>
          )
        }
      />
      <Card size="sm">
        <CardContent>
          <QuickAddTask
            onCreated={reload}
            defaultDue={due || null}
            extra={<DatePicker value={due} onChange={(v) => setDue(v ?? '')} aria-label="Due date when none is typed" placeholder="No date" />}
          />
        </CardContent>
      </Card>
      {total === 0 && (
        <EmptyState icon="check" title="You are all clear">
          Nothing assigned to you right now.
        </EmptyState>
      )}
      {SECTIONS.map((s) =>
        (data[s.id] ?? []).length ? (
          <Collapsible key={s.id} open={!collapsed[s.id]} onOpenChange={(open) => setCollapsed({ ...collapsed, [s.id]: !open })}>
            <Card size="sm" className={cn('gap-2', s.tone === 'danger' && 'ring-destructive/30', s.tone === 'warn' && 'ring-warning/40')}>
              <CardHeader>
                <CollapsibleTrigger className="group/trigger flex w-full items-center gap-2 text-left outline-none">
                  <ChevronRight className="size-4 text-muted-foreground transition-transform group-data-[panel-open]/trigger:rotate-90" />
                  <h2 className={cn('font-heading text-base font-semibold', s.tone === 'danger' && 'text-destructive')}>{s.title}</h2>
                  <Pill tone={s.tone === 'danger' ? 'danger' : s.tone === 'warn' ? 'warning' : 'neutral'}>{data[s.id].length}</Pill>
                  <span className="truncate text-xs text-muted-foreground">{s.hint}</span>
                </CollapsibleTrigger>
              </CardHeader>
              <CollapsibleContent>
                <CardContent className="flex flex-col">
                  {data[s.id].map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      onOpen={() => openTask(t.id)}
                      onToggle={(d) => toggle(t, d)}
                      selection={
                        selecting
                          ? {
                              selected: picked.has(t.id),
                              onChange: (on) => {
                                const next = new Set(picked);
                                if (on) next.add(t.id);
                                else next.delete(t.id);
                                setPicked(next);
                              },
                            }
                          : undefined
                      }
                    />
                  ))}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        ) : null,
      )}
      {selecting && (
        <BulkBar
          tasks={SECTIONS.flatMap((s) => data[s.id] ?? []).filter((t, i, all) => picked.has(t.id) && all.findIndex((x) => x.id === t.id) === i)}
          onClear={stopSelecting}
          reload={reload}
        />
      )}
      {/* Room for the bar, so it never covers the last task. */}
      {selecting && <div className="h-24" aria-hidden />}
    </Page>
  );
}
