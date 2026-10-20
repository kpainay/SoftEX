import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs, type Channel, type Priority, type Task, type TaskStatus } from '../api';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { useShell } from '../components/Layout';
import { WhenModal } from '../components/Later';
import { UpgradeNotice, usePlan } from '../components/Plan';
import { Bar, BarChart, XAxis } from 'recharts';
import {
  EmptyState,
  ErrorState,
  FilterBar,
  FormField,
  IconButton,
  Loading,
  LoadingRows,
  Modal,
  Page,
  PageHeader,
  Pill,
  StatCard,
  StatGrid,
  SwitchField,
  TabBar,
  toneFor,
  useAction,
  useConfirm,
} from '@/components/kit';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { FieldLegend, FieldSet } from '@/components/ui/field';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { dateTime, plainMentions, STATUS_LABEL, timeAgo } from '../format';
import { useApi, useRealtime } from '../hooks';
import { usePeople, useSession } from '../session';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

const DAY = 86_400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const parseDay = (s: string) => new Date(`${s}T00:00:00Z`);
const addDays = (s: string, n: number) => isoDay(new Date(parseDay(s).getTime() + n * DAY));
const daysBetween = (a: string, b: string) => Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / DAY);
const shortDate = (s: string) => parseDay(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

// ======================= Workload =======================

interface WorkloadItem {
  id: string;
  title: string;
  due_date: string | null;
  project: string;
  color: string;
  estimate_hours: number | null;
}
interface WorkloadData {
  weeks: string[];
  capacity_hours_per_week: number;
  rows: { person: { id: string; name: string; color: string; title: string }; total: number; buckets: Record<string, { tasks: number; hours: number; items: WorkloadItem[] }> }[];
}

export function Workload() {
  const { has } = usePlan();
  if (!has('planning')) {
    return (
      <Page>
        <PageHeader eyebrow="Planning" title="Workload" />
        <UpgradeNotice feature="planning" />
      </Page>
    );
  }
  return <WorkloadView />;
}

function WorkloadView() {
  const { openTask } = useShell();
  const [weeks, setWeeks] = useState(4);
  const [projectId, setProjectId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [cell, setCell] = useState<{ person: string; key: string; items: WorkloadItem[] } | null>(null);
  const { data: projects } = useApi<{ id: string; name: string }[]>('/projects');
  const { data: teams } = useApi<{ id: string; name: string }[]>('/teams');
  const { data, error, reload } = useApi<WorkloadData>(`/workload${qs({ weeks, projectId, teamId })}`);
  useRealtime((e) => e.type === 'task.updated' && reload());

  const keys = data ? ['overdue', ...data.weeks, 'unscheduled'] : [];
  const label = (k: string) => (k === 'overdue' ? 'Overdue' : k === 'unscheduled' ? 'No date' : `Week of ${shortDate(k)}`);
  // Without estimates, assume a task is about a day's work so the heat map still says something useful.
  const load = (b: { tasks: number; hours: number }) => (b.hours || b.tasks * 6) / (data?.capacity_hours_per_week ?? 32);

  const levelClass = ['bg-success-soft text-success', 'bg-success/25 text-success', 'bg-warning-soft text-warning', 'bg-destructive/15 text-destructive'];
  return (
    <Page width="full" className="max-w-7xl">
      <PageHeader eyebrow="Planning" title="Workload" description="Open tasks per person by due week. Use it to spot overload before it becomes a missed deadline." />
      <FilterBar>
        <NativeSelect value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="Project">
          <NativeSelectOption value="">All projects</NativeSelectOption>
          {(projects ?? []).map((p) => (
            <NativeSelectOption key={p.id} value={p.id}>
              {p.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect value={teamId} onChange={(e) => setTeamId(e.target.value)} aria-label="Team">
          <NativeSelectOption value="">Everyone</NativeSelectOption>
          {(teams ?? []).map((t) => (
            <NativeSelectOption key={t.id} value={t.id}>
              {t.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} aria-label="Weeks shown">
          {[2, 4, 6, 8, 12].map((n) => (
            <NativeSelectOption key={n} value={n}>
              {n} weeks
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <span className="flex-1" />
        <span className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <i className="size-3 rounded bg-success-soft ring-1 ring-success/30" /> Light
          </span>
          <span className="flex items-center gap-1.5">
            <i className="size-3 rounded bg-warning-soft ring-1 ring-warning/30" /> Full
          </span>
          <span className="flex items-center gap-1.5">
            <i className="size-3 rounded bg-destructive/15 ring-1 ring-destructive/30" /> Over capacity
          </span>
        </span>
      </FilterBar>
      {error && <ErrorState error={error} retry={reload} />}
      {!data && !error && <Loading />}
      {data && !data.rows.length && <EmptyState icon="users" title="No one has open work here" />}
      {data && data.rows.length > 0 && (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col" className="sticky left-0 z-10 bg-card">
                  Person
                </TableHead>
                {keys.map((k) => (
                  <TableHead scope="col" key={k} className={cn('text-center', k === 'overdue' && 'text-destructive')}>
                    {label(k)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row) => (
                <TableRow key={row.person.id} className="hover:bg-transparent">
                  <TableHead scope="row" className="sticky left-0 z-10 h-auto bg-card py-2">
                    <Link to={`/people/${row.person.id}`} className="flex items-center gap-2 font-normal">
                      <Avatar user={row.person} size="sm" />
                      <span className="flex flex-col">
                        <strong className="font-medium text-foreground">{row.person.name}</strong>
                        <span className="text-xs text-muted-foreground">{row.total} open</span>
                      </span>
                    </Link>
                  </TableHead>
                  {keys.map((k) => {
                    const b = row.buckets[k];
                    const level = k === 'unscheduled' ? 0 : Math.min(3, Math.floor(load(b) * 2.2));
                    return (
                      <TableCell key={k} className="p-1 text-center">
                        {b.tasks > 0 ? (
                          <button
                            className={cn(
                              'flex h-11 w-full min-w-16 flex-col items-center justify-center rounded-lg text-sm transition-transform hover:scale-[1.03] focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none',
                              k === 'overdue' ? 'bg-destructive text-white' : k === 'unscheduled' ? 'bg-muted text-muted-foreground' : levelClass[level],
                            )}
                            onClick={() => setCell({ person: row.person.name, key: k, items: b.items })}
                            aria-label={`${row.person.name}, ${label(k)}: ${b.tasks} tasks`}
                          >
                            <strong className="font-semibold tabular-nums">{b.tasks}</strong>
                            {b.hours > 0 && <span className="text-[10px] opacity-80">{b.hours}h</span>}
                          </button>
                        ) : (
                          <span className="text-muted-foreground/50">·</span>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <Modal open={!!cell} onClose={() => setCell(null)} title={cell ? `${cell.person} · ${label(cell.key)}` : ''}>
        <ItemGroup className="gap-1">
          {cell?.items.map((t) => (
            <Item
              key={t.id}
              size="sm"
              className="hover:bg-muted"
              render={
                <button
                  type="button"
                  onClick={() => {
                    setCell(null);
                    openTask(t.id);
                  }}
                />
              }
            >
              <ItemMedia>
                <span className="size-2.5 rounded-full" style={{ background: `var(--c-${t.color})` }} />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{t.title}</ItemTitle>
                <ItemDescription>
                  {t.project} · {t.due_date ? `due ${shortDate(t.due_date)}` : 'no due date'}
                  {t.estimate_hours ? ` · ${t.estimate_hours}h` : ''}
                </ItemDescription>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      </Modal>
    </Page>
  );
}

// ======================= Later: reminders and scheduled messages =======================

interface Reminder {
  id: string;
  remind_at: string;
  note: string;
  task_id: string | null;
  task_title: string | null;
  message_id: string | null;
  message_body: string | null;
  channel_id: string | null;
}
interface Scheduled {
  id: string;
  channel_id: string;
  channel_name: string;
  channel_kind: string;
  parent_id: string | null;
  body: string;
  send_at: string;
  failed_reason: string | null;
}

export function Later() {
  const act = useAction();
  const [tab, setTab] = useState<'reminders' | 'scheduled'>('reminders');
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState<Scheduled | null>(null);
  const reminders = useApi<Reminder[]>('/reminders');
  const scheduled = useApi<Scheduled[]>('/scheduled-messages');
  useRealtime((e) => {
    if (e.type === 'notification' || e.type === 'message.created') {
      reminders.reload();
      scheduled.reload();
    }
  });

  const itemClass = 'flex items-start gap-3 rounded-xl border bg-card p-3 shadow-sm';
  return (
    <Page width="narrow">
      <PageHeader
        eyebrow="Later"
        title="Reminders and scheduled messages"
        description="Nudges for your future self, and messages that go out at a better time for the people receiving them."
        actions={
          <Button onClick={() => setAdding(true)}>
            <Icon name="plus" data-icon="inline-start" /> Reminder
          </Button>
        }
      />
      <TabBar
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'reminders', label: 'Reminders', count: reminders.data?.length },
          { id: 'scheduled', label: 'Scheduled messages', count: scheduled.data?.length },
        ]}
      />
      {tab === 'reminders' && (
        <>
          {reminders.error && <ErrorState error={reminders.error} retry={reminders.reload} />}
          {!reminders.data && !reminders.error && <LoadingRows rows={3} />}
          {reminders.data && !reminders.data.length && (
            <EmptyState icon="clock" title="No reminders">
              Use “Remind me” on a message or task, or add a note here.
            </EmptyState>
          )}
          <ul className="later-list flex flex-col gap-2">
            {reminders.data?.map((r) => (
              <li key={r.id} className={itemClass}>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <Icon name="clock" size={16} />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
                  <strong className="font-semibold">{dateTime(r.remind_at)}</strong>
                  <p className="text-muted-foreground">
                    {r.note && <span className="text-foreground">{r.note} </span>}
                    {r.task_id && (
                      <Link className="text-primary hover:underline" to={`/tasks/${r.task_id}`}>
                        Task: {r.task_title}
                      </Link>
                    )}
                    {r.message_id && r.channel_id && (
                      <Link className="text-primary hover:underline" to={`/channels/${r.channel_id}?message=${r.message_id}`}>
                        “{plainMentions(r.message_body ?? '').slice(0, 120)}”
                      </Link>
                    )}
                  </p>
                </div>
                <IconButton label="Delete reminder" size="icon-sm" onClick={async () => (await act(() => api.del(`/reminders/${r.id}`), 'Reminder removed')) && reminders.reload()}>
                  <Icon name="trash" />
                </IconButton>
              </li>
            ))}
          </ul>
        </>
      )}
      {tab === 'scheduled' && (
        <>
          {scheduled.error && <ErrorState error={scheduled.error} retry={scheduled.reload} />}
          {!scheduled.data && !scheduled.error && <LoadingRows rows={3} />}
          {scheduled.data && !scheduled.data.length && (
            <EmptyState icon="send" title="Nothing scheduled">
              Write a message, then choose the clock next to Send.
            </EmptyState>
          )}
          <ul className="later-list flex flex-col gap-2">
            {scheduled.data?.map((s) => (
              <li key={s.id} className={cn(itemClass, s.failed_reason && 'border-destructive/40')}>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <Icon name="send" size={16} />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
                  <strong className="font-semibold">
                    {dateTime(s.send_at)} ·{' '}
                    <Link className="text-primary hover:underline" to={`/channels/${s.channel_id}`}>
                      {s.channel_kind === 'dm' ? 'Direct message' : `#${s.channel_name}`}
                    </Link>
                    {s.parent_id && <span className="font-normal text-muted-foreground"> (thread reply)</span>}
                  </strong>
                  <p className="text-muted-foreground">{plainMentions(s.body).slice(0, 280)}</p>
                  {s.failed_reason && <p className="text-xs text-destructive">Not sent: {s.failed_reason}</p>}
                </div>
                <Button variant="outline" size="sm" onClick={() => setMoving(s)}>
                  Reschedule
                </Button>
                <IconButton
                  label="Cancel scheduled message"
                  size="icon-sm"
                  onClick={async () => (await act(() => api.del(`/scheduled-messages/${s.id}`), 'Scheduled message cancelled')) && scheduled.reload()}
                >
                  <Icon name="trash" />
                </IconButton>
              </li>
            ))}
          </ul>
        </>
      )}
      <WhenModal
        open={adding}
        onClose={() => setAdding(false)}
        eyebrow="Reminder"
        title="New reminder"
        confirmLabel="Set reminder"
        withNote
        onPick={async (iso, note) => {
          const ok = await act(() => api.post('/reminders', { remindAt: iso, note }), 'Reminder set');
          if (ok) reminders.reload();
          return ok;
        }}
      />
      <WhenModal
        open={!!moving}
        onClose={() => setMoving(null)}
        eyebrow="Send later"
        title="Reschedule message"
        confirmLabel="Reschedule"
        onPick={async (iso) => {
          const ok = await act(() => api.patch(`/scheduled-messages/${moving!.id}`, { sendAt: iso }), 'Rescheduled');
          if (ok) scheduled.reload();
          return ok;
        }}
      />
    </Page>
  );
}

// ======================= Project timeline (Gantt) =======================

interface Milestone {
  id: string;
  name: string;
  due_date: string | null;
  done_at: string | null;
}

export function ProjectTimeline({ projectId, milestones, canEdit }: { projectId: string; milestones: Milestone[]; canEdit: boolean }) {
  const { openTask } = useShell();
  const act = useAction();
  const [showDone, setShowDone] = useState(false);
  const { data: tasks, error, reload, setData } = useApi<Task[]>(`/tasks${qs({ projectId })}`);
  useRealtime((e) => e.type === 'task.updated' && e.projectId === projectId && reload());
  const drag = useRef<{ id: string; x: number; mode: 'move' | 'end'; start: string; due: string } | null>(null);
  const [preview, setPreview] = useState<{ id: string; start: string; due: string } | null>(null);
  const PX = 28;

  const visible = useMemo(
    () =>
      (tasks ?? [])
        .filter((t) => showDone || t.status !== 'done')
        .filter((t) => t.due_date)
        .sort((a, b) => (a.start_date ?? a.due_date!).localeCompare(b.start_date ?? b.due_date!)),
    [tasks, showDone],
  );
  const undated = (tasks ?? []).filter((t) => !t.due_date && t.status !== 'done');

  const range = useMemo(() => {
    const today = isoDay(new Date());
    const dates = [today, ...visible.flatMap((t) => [t.start_date ?? t.due_date!, t.due_date!]), ...milestones.flatMap((m) => (m.due_date ? [m.due_date] : []))];
    let from = addDays(dates.reduce((a, b) => (a < b ? a : b)), -3);
    let to = addDays(dates.reduce((a, b) => (a > b ? a : b)), 7);
    if (daysBetween(from, to) < 35) to = addDays(from, 35);
    if (daysBetween(from, to) > 240) from = addDays(to, -240);
    return { from, to, days: daysBetween(from, to) + 1, today };
  }, [visible, milestones]);

  const x = (d: string) => Math.max(0, Math.min(range.days, daysBetween(range.from, d))) * PX;
  const months = useMemo(() => {
    const out: { label: string; left: number }[] = [];
    for (let i = 0; i < range.days; i++) {
      const d = addDays(range.from, i);
      if (i === 0 || d.endsWith('-01')) out.push({ label: parseDay(d).toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' }), left: i * PX });
    }
    return out;
  }, [range]);
  // Up to 240 cells that only change with the range, not while a bar is dragged.
  const dayCells = useMemo(
    () =>
      Array.from({ length: range.days }, (_, i) => {
        const d = addDays(range.from, i);
        const dow = parseDay(d).getUTCDay();
        return (
          <span key={d} className={`tl-day ${dow === 0 || dow === 6 ? 'weekend' : ''}`} style={{ left: i * PX, width: PX }}>
            {d.slice(8)}
          </span>
        );
      }),
    [range],
  );

  const onPointerDown = (e: React.PointerEvent, t: Task, mode: 'move' | 'end') => {
    if (!canEdit) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: t.id, x: e.clientX, mode, start: t.start_date ?? t.due_date!, due: t.due_date! };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const delta = Math.round((e.clientX - d.x) / PX);
    const due = addDays(d.due, delta);
    const next = d.mode === 'move' ? { id: d.id, start: addDays(d.start, delta), due } : { id: d.id, start: d.start, due: due < d.start ? d.start : due };
    // Pointer moves within the same day change nothing, so they don't redraw the timeline.
    setPreview((prev) => (prev && prev.id === next.id && prev.start === next.start && prev.due === next.due ? prev : next));
  };
  const onPointerUp = async (t: Task) => {
    const p = preview;
    drag.current = null;
    setPreview(null);
    if (!p || p.id !== t.id || (p.due === t.due_date && p.start === (t.start_date ?? t.due_date))) {
      if (!p) openTask(t.id);
      return;
    }
    setData((prev) => prev?.map((x) => (x.id === t.id ? { ...x, start_date: p.start === p.due ? x.start_date : p.start, due_date: p.due } : x)));
    await act(() => api.patch(`/tasks/${t.id}`, { dueDate: p.due, startDate: p.start === p.due && !t.start_date ? null : p.start }), 'Rescheduled');
    reload();
  };

  if (error) return <ErrorState error={error} retry={reload} />;
  if (!tasks) return <Loading />;

  return (
    <div className="flex flex-col gap-3">
      <FilterBar>
        <span className="text-xs text-muted-foreground">{canEdit ? 'Drag a bar to move it, or its right edge to change the due date. Click to open.' : 'Click a bar to open the task.'}</span>
        <span className="flex-1" />
        <SwitchField label="Show done" checked={showDone} onCheckedChange={setShowDone} className="w-auto" />
      </FilterBar>
      {!visible.length && !milestones.some((m) => m.due_date) ? (
        <EmptyState icon="calendar" title="Nothing on the timeline yet">
          Give tasks a due date (and optionally a start date) to see them here.
        </EmptyState>
      ) : (
        <div className="gantt" role="figure" aria-label="Project timeline">
          <div className="tl-labels">
            <div className="tl-head" />
            {milestones.some((m) => m.due_date) && <div className="tl-row tl-label text-muted-foreground">Milestones</div>}
            {visible.map((t) => (
              <button key={t.id} className="tl-row tl-label" onClick={() => openTask(t.id)} title={t.title}>
                <span
                  className={cn('size-2 shrink-0 rounded-full', t.status === 'done' ? 'bg-success' : t.status === 'blocked' ? 'bg-destructive' : t.status === 'in_progress' ? 'bg-info' : t.status === 'review' ? 'bg-warning' : 'bg-muted-foreground/50')}
                  aria-label={STATUS_LABEL[t.status]}
                  role="img"
                />
                <span className="ellipsis">{t.title}</span>
              </button>
            ))}
          </div>
          <div className="tl-scroll">
            <div className="tl-canvas" style={{ width: range.days * PX }}>
              <div className="tl-head">
                {months.map((m) => (
                  <span key={m.left} className="tl-month" style={{ left: m.left }}>
                    {m.label}
                  </span>
                ))}
                {dayCells}
              </div>
              <div className="tl-today" style={{ left: x(range.today) + PX / 2 }} aria-hidden="true" />
              {milestones.some((m) => m.due_date) && (
                <div className="tl-row">
                  {milestones
                    .filter((m) => m.due_date)
                    .map((m) => (
                      <span key={m.id} className={`tl-milestone ${m.done_at ? 'done' : ''}`} style={{ left: x(m.due_date!) + PX / 2 }} title={`${m.name} · ${shortDate(m.due_date!)}`}>
                        <i />
                        <small>{m.name}</small>
                      </span>
                    ))}
                </div>
              )}
              {visible.map((t) => {
                const p = preview?.id === t.id ? preview : null;
                const start = p?.start ?? t.start_date ?? t.due_date!;
                const due = p?.due ?? t.due_date!;
                const s = start > due ? due : start;
                return (
                  <div key={t.id} className="tl-row">
                    <div
                      className={`tl-bar status-${t.status} ${t.overdue ? 'overdue' : ''} ${canEdit ? 'editable' : ''} ${daysBetween(s, due) < 4 ? 'short' : ''}`}
                      style={{ left: x(s), width: (daysBetween(s, due) + 1) * PX - 4 }}
                      onPointerDown={(e) => onPointerDown(e, t, 'move')}
                      onPointerMove={onPointerMove}
                      onPointerUp={() => onPointerUp(t)}
                      title={`${t.title}\n${shortDate(s)} → ${shortDate(due)}${t.owner ? `\n${t.owner.name}` : ''}`}
                    >
                      {t.owner && <Avatar user={t.owner} size="xs" />}
                      <span className="ellipsis">{t.title}</span>
                      {canEdit && <i className="tl-handle" onPointerDown={(e) => onPointerDown(e, t, 'end')} />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {undated.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {undated.length} open task{undated.length === 1 ? ' has' : 's have'} no due date and {undated.length === 1 ? 'is' : 'are'} not shown.
        </p>
      )}
    </div>
  );
}

// ======================= Project automations =======================

interface Rule {
  id: string;
  name: string;
  trigger_type: string;
  trigger_config: { to_status?: TaskStatus; from_status?: TaskStatus; priority?: Priority };
  action_type: string;
  action_config: { user_id?: string; target?: string; priority?: Priority; channel_id?: string; text?: string; items?: string[] };
  enabled: boolean;
  run_count: number;
  last_run_at: string | null;
  created_by: { id: string; name: string } | null;
}

const TRIGGER_LABEL: Record<string, string> = {
  'task.created': 'A task is created',
  'task.status_changed': 'A task changes status',
  'task.overdue': 'A task becomes overdue',
};
const ACTION_LABEL: Record<string, string> = {
  assign: 'Assign it to someone',
  set_priority: 'Set its priority',
  notify: 'Notify someone',
  post_message: 'Post in a channel',
  add_checklist: 'Add checklist items',
};
const TARGET_LABEL: Record<string, string> = { owner: 'the task owner', reviewer: 'the reviewer', project_owner: 'the project owner', user: 'a specific person' };

const TEMPLATES: { name: string; description: string; rule: Partial<RuleDraft> }[] = [
  {
    name: 'Review handoff',
    description: 'When a task moves to review, notify the reviewer.',
    rule: { name: 'Hand off to reviewer', triggerType: 'task.status_changed', toStatus: 'review', actionType: 'notify', target: 'reviewer', text: '“{{task}}” is ready for your review.' },
  },
  {
    name: 'Blocked escalation',
    description: 'When a task becomes blocked, tell the project owner.',
    rule: { name: 'Escalate blockers', triggerType: 'task.status_changed', toStatus: 'blocked', actionType: 'notify', target: 'project_owner', text: '“{{task}}” in {{project}} is blocked.' },
  },
  {
    name: 'Overdue is urgent',
    description: 'Raise priority to urgent when a task slips past its due date.',
    rule: { name: 'Overdue tasks are urgent', triggerType: 'task.overdue', actionType: 'set_priority', priority: 'urgent' },
  },
  {
    name: 'Definition of done',
    description: 'Add a standard checklist to every new task.',
    rule: { name: 'Definition of done', triggerType: 'task.created', actionType: 'add_checklist', items: 'Acceptance criteria agreed\nReviewed by a teammate\nDocs updated' },
  },
];

interface RuleDraft {
  name: string;
  triggerType: string;
  toStatus: string;
  fromStatus: string;
  priorityFilter: string;
  actionType: string;
  target: string;
  userId: string;
  priority: string;
  channelId: string;
  text: string;
  items: string;
}
const EMPTY: RuleDraft = {
  name: '',
  triggerType: 'task.created',
  toStatus: '',
  fromStatus: '',
  priorityFilter: '',
  actionType: 'notify',
  target: 'owner',
  userId: '',
  priority: 'high',
  channelId: '',
  text: '',
  items: '',
};

const toDraft = (r: Rule): RuleDraft => ({
  name: r.name,
  triggerType: r.trigger_type,
  toStatus: r.trigger_config.to_status ?? '',
  fromStatus: r.trigger_config.from_status ?? '',
  priorityFilter: r.trigger_config.priority ?? '',
  actionType: r.action_type,
  target: r.action_config.target ?? 'user',
  userId: r.action_config.user_id ?? '',
  priority: r.action_config.priority ?? 'high',
  channelId: r.action_config.channel_id ?? '',
  text: r.action_config.text ?? '',
  items: (r.action_config.items ?? []).join('\n'),
});

function describe(r: Rule, people: { id: string; name: string }[], channels: Channel[]) {
  const when =
    r.trigger_type === 'task.status_changed'
      ? `a task moves${r.trigger_config.from_status ? ` from ${STATUS_LABEL[r.trigger_config.from_status]}` : ''}${r.trigger_config.to_status ? ` to ${STATUS_LABEL[r.trigger_config.to_status]}` : ''}`
      : TRIGGER_LABEL[r.trigger_type].replace(/^A /, 'a ');
  const who = (target?: string, userId?: string) => (target && target !== 'user' ? TARGET_LABEL[target] : people.find((p) => p.id === userId)?.name ?? 'someone');
  const c = r.action_config;
  const then =
    r.action_type === 'assign'
      ? `assign it to ${who(c.target, c.user_id)}`
      : r.action_type === 'set_priority'
        ? `set priority to ${c.priority}`
        : r.action_type === 'notify'
          ? `notify ${who(c.target, c.user_id)}`
          : r.action_type === 'post_message'
            ? `post in #${channels.find((ch) => ch.id === c.channel_id)?.name ?? 'a channel'}`
            : `add ${c.items?.length ?? 0} checklist item${c.items?.length === 1 ? '' : 's'}`;
  return `When ${when}${r.trigger_config.priority ? ` (priority ${r.trigger_config.priority})` : ''}, ${then}.`;
}

export function ProjectAutomations({ projectId }: { projectId: string }) {
  const act = useAction();
  const confirm = useConfirm();
  const people = usePeople();
  const { data, error, reload } = useApi<{ can_manage: boolean; automations: Rule[] }>(`/projects/${projectId}/automations`);
  const { data: channels } = useApi<Channel[]>('/channels');
  const [editing, setEditing] = useState<{ id?: string; draft: RuleDraft } | null>(null);
  const [runsFor, setRunsFor] = useState<Rule | null>(null);

  if (error) return <ErrorState error={error} retry={reload} />;
  if (!data) return <Loading />;
  const postable = (channels ?? []).filter((c) => c.kind !== 'dm' && c.joined && (c.kind === 'public' || c.project_id === projectId));

  const save = async () => {
    if (!editing) return;
    const d = editing.draft;
    const triggerConfig: Record<string, string> = {};
    if (d.triggerType === 'task.status_changed') {
      if (d.toStatus) triggerConfig.to_status = d.toStatus;
      if (d.fromStatus) triggerConfig.from_status = d.fromStatus;
    }
    if (d.priorityFilter) triggerConfig.priority = d.priorityFilter;
    const actionConfig: Record<string, unknown> = {};
    if (d.actionType === 'assign' || d.actionType === 'notify') {
      actionConfig.target = d.actionType === 'assign' && d.target !== 'project_owner' ? 'user' : d.target;
      if (actionConfig.target === 'user') actionConfig.user_id = d.userId;
      if (d.actionType === 'notify' && d.text) actionConfig.text = d.text;
    }
    if (d.actionType === 'set_priority') actionConfig.priority = d.priority;
    if (d.actionType === 'post_message') Object.assign(actionConfig, { channel_id: d.channelId, text: d.text || undefined });
    if (d.actionType === 'add_checklist') actionConfig.items = d.items.split('\n').map((s) => s.trim()).filter(Boolean);
    const body = { name: d.name || TRIGGER_LABEL[d.triggerType], triggerType: d.triggerType, triggerConfig, actionType: d.actionType, actionConfig };
    const ok = await act(
      () => (editing.id ? api.patch(`/automations/${editing.id}`, body) : api.post(`/projects/${projectId}/automations`, body)),
      editing.id ? 'Automation updated' : 'Automation created',
    );
    if (ok) {
      setEditing(null);
      reload();
    }
  };

  const set = (patch: Partial<RuleDraft>) => setEditing((e) => (e ? { ...e, draft: { ...e.draft, ...patch } } : e));
  const d = editing?.draft;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">
          Automations run “when this happens, do that” for tasks in this project. They act with their creator’s access, never trigger each other, and every run is logged.
        </p>
        {data.can_manage && (
          <Button onClick={() => setEditing({ draft: { ...EMPTY } })}>
            <Icon name="plus" data-icon="inline-start" /> New automation
          </Button>
        )}
      </div>
      {!data.automations.length && (
        <>
          <EmptyState icon="refresh" title="No automations yet">
            {data.can_manage ? 'Start from a template or build your own.' : 'Project managers can add automations.'}
          </EmptyState>
          {data.can_manage && (
            <ItemGroup className="grid gap-3 sm:grid-cols-2">
              {TEMPLATES.map((t) => (
                <Item key={t.name} variant="outline" className="items-start hover:bg-muted" render={<button type="button" onClick={() => setEditing({ draft: { ...EMPTY, ...t.rule } })} />}>
                  <ItemMedia variant="icon" className="size-8 rounded-lg bg-accent text-accent-foreground">
                    <Icon name="refresh" />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{t.name}</ItemTitle>
                    <ItemDescription>{t.description}</ItemDescription>
                  </ItemContent>
                </Item>
              ))}
            </ItemGroup>
          )}
        </>
      )}
      <div className="flex flex-col gap-3">
        {data.automations.map((r) => (
          <Card key={r.id} size="sm" className={cn(!r.enabled && 'opacity-70')}>
            <CardHeader>
              <CardTitle>{r.name}</CardTitle>
              <CardDescription className="text-foreground/80">{describe(r, people, channels ?? [])}</CardDescription>
              {data.can_manage && (
                <CardAction>
                  <Switch
                    checked={r.enabled}
                    aria-label={`${r.name} enabled`}
                    onCheckedChange={async (checked) => (await act(() => api.patch(`/automations/${r.id}`, { enabled: checked }))) && reload()}
                  />
                </CardAction>
              )}
            </CardHeader>
            <CardFooter className="flex-wrap gap-2">
              <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                Ran {r.run_count} time{r.run_count === 1 ? '' : 's'}
                {r.last_run_at && `, last ${timeAgo(r.last_run_at)}`} · by {r.created_by?.name ?? 'a former member'}
              </span>
              <Button variant="outline" size="sm" onClick={() => setRunsFor(r)}>
                Run log
              </Button>
              {data.can_manage && (
                <>
                  <IconButton label={`Edit ${r.name}`} size="icon-sm" onClick={() => setEditing({ id: r.id, draft: toDraft(r) })}>
                    <Icon name="edit" />
                  </IconButton>
                  <IconButton
                    label={`Delete ${r.name}`}
                    size="icon-sm"
                    onClick={async () =>
                      (await confirm({ title: `Delete “${r.name}”?`, confirmLabel: 'Delete', destructive: true })) &&
                      (await act(() => api.del(`/automations/${r.id}`), 'Automation deleted')) &&
                      reload()
                    }
                  >
                    <Icon name="trash" />
                  </IconButton>
                </>
              )}
            </CardFooter>
          </Card>
        ))}
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit automation' : 'New automation'} eyebrow="Automation" wide>
        {d && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <FormField label="Name">
              <Input value={d.name} onChange={(e) => set({ name: e.target.value })} maxLength={100} placeholder="e.g. Hand off to reviewer" />
            </FormField>
            <FieldSet className="gap-3 rounded-xl border p-4">
              <FieldLegend className="mb-0 px-1">When</FieldLegend>
              <NativeSelect value={d.triggerType} onChange={(e) => set({ triggerType: e.target.value })} aria-label="Trigger">
                {Object.entries(TRIGGER_LABEL).map(([id, label]) => (
                  <NativeSelectOption key={id} value={id}>
                    {label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {d.triggerType === 'task.status_changed' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label="From">
                    <NativeSelect value={d.fromStatus} onChange={(e) => set({ fromStatus: e.target.value })}>
                      <NativeSelectOption value="">Any status</NativeSelectOption>
                      {Object.entries(STATUS_LABEL).map(([id, l]) => (
                        <NativeSelectOption key={id} value={id}>
                          {l}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField label="To">
                    <NativeSelect value={d.toStatus} onChange={(e) => set({ toStatus: e.target.value })}>
                      <NativeSelectOption value="">Any status</NativeSelectOption>
                      {Object.entries(STATUS_LABEL).map(([id, l]) => (
                        <NativeSelectOption key={id} value={id}>
                          {l}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </FormField>
                </div>
              )}
              <FormField label="Only for priority">
                <NativeSelect value={d.priorityFilter} onChange={(e) => set({ priorityFilter: e.target.value })}>
                  <NativeSelectOption value="">Any priority</NativeSelectOption>
                  {['low', 'medium', 'high', 'urgent'].map((p) => (
                    <NativeSelectOption key={p} value={p}>
                      {p}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </FormField>
            </FieldSet>
            <FieldSet className="gap-3 rounded-xl border p-4">
              <FieldLegend className="mb-0 px-1">Then</FieldLegend>
              <NativeSelect value={d.actionType} onChange={(e) => set({ actionType: e.target.value })} aria-label="Action">
                {Object.entries(ACTION_LABEL).map(([id, label]) => (
                  <NativeSelectOption key={id} value={id}>
                    {label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {(d.actionType === 'assign' || d.actionType === 'notify') && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label={d.actionType === 'assign' ? 'Assign to' : 'Who'}>
                    <NativeSelect value={d.target} onChange={(e) => set({ target: e.target.value })}>
                      {(d.actionType === 'assign' ? ['project_owner', 'user'] : ['owner', 'reviewer', 'project_owner', 'user']).map((t) => (
                        <NativeSelectOption key={t} value={t}>
                          {TARGET_LABEL[t]}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </FormField>
                  {(d.target === 'user' || (d.actionType === 'assign' && d.target !== 'project_owner')) && (
                    <FormField label="Person">
                      <NativeSelect value={d.userId} onChange={(e) => set({ userId: e.target.value })} required>
                        <NativeSelectOption value="">Choose…</NativeSelectOption>
                        {people.map((p) => (
                          <NativeSelectOption key={p.id} value={p.id}>
                            {p.name}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </FormField>
                  )}
                </div>
              )}
              {d.actionType === 'set_priority' && (
                <FormField label="Priority">
                  <NativeSelect value={d.priority} onChange={(e) => set({ priority: e.target.value })}>
                    {['low', 'medium', 'high', 'urgent'].map((p) => (
                      <NativeSelectOption key={p} value={p}>
                        {p}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </FormField>
              )}
              {d.actionType === 'post_message' && (
                <FormField label="Channel" hint="Public channels, or private channels that belong to this project.">
                  <NativeSelect value={d.channelId} onChange={(e) => set({ channelId: e.target.value })} required>
                    <NativeSelectOption value="">Choose…</NativeSelectOption>
                    {postable.map((c) => (
                      <NativeSelectOption key={c.id} value={c.id}>
                        #{c.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </FormField>
              )}
              {(d.actionType === 'notify' || d.actionType === 'post_message') && (
                <FormField label="Message" hint="Placeholders: {{task}}, {{project}}, {{status}}, {{due}}, {{link}}">
                  <Textarea rows={2} value={d.text} onChange={(e) => set({ text: e.target.value })} maxLength={1000} />
                </FormField>
              )}
              {d.actionType === 'add_checklist' && (
                <FormField label="Checklist items" hint="One per line, up to 20.">
                  <Textarea rows={4} value={d.items} onChange={(e) => set({ items: e.target.value })} required />
                </FormField>
              )}
            </FieldSet>
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1" />
              <Button variant="outline" type="button" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit">{editing?.id ? 'Save' : 'Create automation'}</Button>
            </div>
          </form>
        )}
      </Modal>
      <Modal open={!!runsFor} onClose={() => setRunsFor(null)} title={runsFor ? `Run log · ${runsFor.name}` : ''}>
        {runsFor && <RunLog ruleId={runsFor.id} />}
      </Modal>
    </div>
  );
}

function RunLog({ ruleId }: { ruleId: string }) {
  const { data, error } = useApi<{ id: string; outcome: string; detail: string; created_at: string; task: { id: string; title: string } | null }[]>(`/automations/${ruleId}/runs`);
  if (error) return <ErrorState error={error} />;
  if (!data) return <Loading />;
  if (!data.length) return <p className="text-muted-foreground">This automation has not run yet.</p>;
  return (
    <ul className="flex flex-col divide-y text-sm">
      {data.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
          <Pill tone={toneFor(r.outcome)} className="capitalize">
            {r.outcome}
          </Pill>
          <span className="min-w-0 flex-1">
            {r.task ? (
              <Link className="text-primary hover:underline" to={`/tasks/${r.task.id}`}>
                {r.task.title}
              </Link>
            ) : (
              <span className="text-muted-foreground">Deleted task</span>
            )}
            {r.detail && <span className="text-xs text-muted-foreground"> — {r.detail}</span>}
          </span>
          <span className="text-xs text-muted-foreground">{timeAgo(r.created_at)}</span>
        </li>
      ))}
    </ul>
  );
}

// ======================= Workspace insights =======================

interface Insights {
  generated_at: string;
  members: number;
  weekly: { week_of: string; active_people: number; messages: number; tasks_completed: number; decisions: number }[];
  measures: { id: string; label: string; value: number | null; unit: string; target?: number; lower_is_better?: boolean; detail?: string }[];
}

export function WorkspaceInsights() {
  const { data, error, reload } = useApi<Insights>('/admin/insights');
  if (error) return <ErrorState error={error} retry={reload} />;
  if (!data) return <Loading />;
  const good = (m: Insights['measures'][number]) => (m.value == null || m.target == null ? null : m.lower_is_better ? m.value <= m.target : m.value >= m.target);
  const series: { key: keyof Insights['weekly'][number]; label: string }[] = [
    { key: 'active_people', label: 'Active people' },
    { key: 'messages', label: 'Messages' },
    { key: 'tasks_completed', label: 'Tasks completed' },
    { key: 'decisions', label: 'Decisions recorded' },
  ];
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        How well Küü is working for the team, measured against the product’s success targets. Aggregated counts only; no individual is ranked. Updated {timeAgo(data.generated_at)}.
      </p>
      <StatGrid>
        {data.measures.map((m) => {
          const ok = good(m);
          return (
            <StatCard
              key={m.id}
              label={m.label}
              tone={ok === true ? 'success' : ok === false ? 'danger' : undefined}
              value={
                <>
                  {m.value == null ? '—' : m.value}
                  {m.value != null && m.unit && <span className="text-base font-normal text-muted-foreground">{m.unit === '%' ? '%' : ` ${m.unit}`}</span>}
                </>
              }
              hint={
                <>
                  {m.target != null && (
                    <span className="block">
                      Target {m.lower_is_better ? '≤' : '≥'} {m.target}
                      {m.unit === '%' ? '%' : ''}
                    </span>
                  )}
                  {m.detail && <span className="block">{m.detail}</span>}
                </>
              }
            />
          );
        })}
      </StatGrid>
      <div className="grid gap-4 md:grid-cols-2">
        {series.map((s, si) => {
          const values = data.weekly.map((w) => Number(w[s.key]));
          const chart = data.weekly.map((w, i) => ({ week: shortDate(w.week_of), value: values[i] }));
          const config = { value: { label: s.label, color: `var(--chart-${(si % 5) + 1})` } } satisfies ChartConfig;
          return (
            <Card key={s.key} size="sm">
              <CardHeader>
                <CardTitle>{s.label}</CardTitle>
                <CardDescription>
                  This week: <strong className="text-foreground tabular-nums">{values[values.length - 1]}</strong> · last 8 weeks
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={config} className="aspect-auto h-28 w-full" role="img" aria-label={`${s.label}: ${values.join(', ')}`}>
                  <BarChart data={chart} margin={{ top: 4, left: 0, right: 0, bottom: 0 }}>
                    <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={6} minTickGap={16} />
                    <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel={false} />} />
                    <Bar dataKey="value" fill="var(--color-value)" radius={4} maxBarSize={28} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
