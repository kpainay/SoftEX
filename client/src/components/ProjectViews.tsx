import { useState } from 'react';
import { api, type CustomField, type Task, type TaskStatus } from '../api';
import { dueLabel, localToday, STATUS_LABEL, duration } from '../format';
import { usePeople, useSession } from '../session';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { FieldInput, FieldValue, LabelChips } from './Work';
import { ChevronDown, ChevronRight, ChevronUp } from 'lucide-react';
import { DatePicker, IconButton, useAction } from '@/components/kit';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'blocked', 'review', 'done'];

type SortKey = 'title' | 'status' | 'owner' | 'due_date' | 'priority' | `f:${string}`;
const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

/** Spreadsheet-style view (Monday/Airtable): every task a row, inline editing, custom fields as columns. */
export function TaskTable({
  tasks,
  fields,
  canEdit,
  onOpen,
  onChanged,
}: {
  tasks: Task[];
  fields: CustomField[];
  canEdit: boolean;
  onOpen: (id: string) => void;
  onChanged: (task: Task) => void;
}) {
  const people = usePeople();
  const act = useAction();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'status', dir: 1 });

  const patch = async (task: Task, body: Record<string, unknown>) => {
    const updated = await act(() => api.patch<Task>(`/tasks/${task.id}`, body));
    if (updated) onChanged({ ...task, ...updated });
  };
  const setField = async (task: Task, field: CustomField, value: unknown) => {
    const res = await act(() => api.put<{ fields: Record<string, unknown> }>(`/tasks/${task.id}/fields/${field.id}`, { value }));
    if (res) onChanged({ ...task, fields: res.fields });
  };

  const valueOf = (t: Task, key: SortKey): string | number => {
    if (key.startsWith('f:')) {
      const v = t.fields?.[key.slice(2)];
      return v === undefined || v === null ? '' : typeof v === 'number' ? v : String(v);
    }
    switch (key) {
      case 'status':
        return STATUSES.indexOf(t.status);
      case 'owner':
        return t.owner?.name ?? '~';
      case 'priority':
        return PRIORITY_RANK[t.priority] ?? 9;
      case 'due_date':
        return t.due_date ?? '9999';
      default:
        return t.title.toLowerCase();
    }
  };
  const rows = [...tasks].sort((a, b) => {
    const x = valueOf(a, sort.key);
    const y = valueOf(b, sort.key);
    return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
  });
  const header = (key: SortKey, label: string) => (
    <TableHead key={key} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <Button variant="ghost" size="xs" className="-ml-2 text-muted-foreground" onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : 1 }))}>
        {label} {sort.key === key && (sort.dir === 1 ? <ChevronDown data-icon="inline-end" /> : <ChevronUp data-icon="inline-end" />)}
      </Button>
    </TableHead>
  );
  const cell = 'w-full min-w-28 border-transparent bg-transparent shadow-none hover:border-input';

  return (
    <Card className="py-0">
      <Table className="min-w-[56rem]">
        <TableHeader>
          <TableRow>
            {header('title', 'Task')}
            {header('status', 'Status')}
            {header('owner', 'Owner')}
            {header('due_date', 'Due')}
            {header('priority', 'Priority')}
            <TableHead>Labels</TableHead>
            <TableHead>Time</TableHead>
            {fields.map((f) => header(`f:${f.id}`, f.name))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((t) => (
            <TableRow key={t.id} className={cn(t.status === 'done' && 'text-muted-foreground')}>
              <TableCell className="max-w-72">
                <Button variant="link" size="inline" className={cn('max-w-full justify-start truncate text-foreground', t.status === 'done' && 'line-through')} onClick={() => onOpen(t.id)}>
                  {t.title}
                </Button>
              </TableCell>
              <TableCell>
                <NativeSelect size="sm" className={cell} value={t.status} disabled={!canEdit} onChange={(e) => patch(t, { status: e.target.value })} aria-label={`Status of ${t.title}`}>
                  {STATUSES.map((s) => (
                    <NativeSelectOption key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </TableCell>
              <TableCell>
                <NativeSelect size="sm" className={cell} value={t.owner?.id ?? ''} disabled={!canEdit} onChange={(e) => patch(t, { ownerId: e.target.value || null })} aria-label={`Owner of ${t.title}`}>
                  <NativeSelectOption value="">Unassigned</NativeSelectOption>
                  {people.map((p) => (
                    <NativeSelectOption key={p.id} value={p.id}>
                      {p.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </TableCell>
              <TableCell className={cn(t.overdue && '[&_button]:text-destructive')}>
                <DatePicker size="sm" value={t.due_date} disabled={!canEdit} clearable={false} placeholder="—" onChange={(v) => patch(t, { dueDate: v })} aria-label={`Due date of ${t.title}`} />
              </TableCell>
              <TableCell>
                <NativeSelect size="sm" className={cn(cell, (t.priority === 'urgent' || t.priority === 'high') && '[&_select]:font-medium [&_select]:text-destructive')} value={t.priority} disabled={!canEdit} onChange={(e) => patch(t, { priority: e.target.value })} aria-label={`Priority of ${t.title}`}>
                  <NativeSelectOption value="low">Low</NativeSelectOption>
                  <NativeSelectOption value="medium">Medium</NativeSelectOption>
                  <NativeSelectOption value="high">High</NativeSelectOption>
                  <NativeSelectOption value="urgent">Urgent</NativeSelectOption>
                </NativeSelect>
              </TableCell>
              <TableCell>
                <LabelChips labels={t.labels} />
              </TableCell>
              <TableCell className="text-muted-foreground tabular-nums">{t.time_minutes ? duration(t.time_minutes) : '—'}</TableCell>
              {fields.map((f) => (
                <TableCell key={f.id}>{canEdit ? <FieldInput field={f} value={t.fields?.[f.id]} onSave={(v) => setField(t, f, v)} /> : <FieldValue field={f} value={t.fields?.[f.id]} />}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!rows.length && <p className="p-6 text-center text-sm text-muted-foreground">No tasks match.</p>}
    </Card>
  );
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Month grid of tasks by due date; drag a task to another day to reschedule. */
export function TaskCalendar({ tasks, canEdit, onOpen, onChanged }: { tasks: Task[]; canEdit: boolean; onOpen: (id: string) => void; onChanged: (task: Task) => void }) {
  const act = useAction();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [dragged, setDragged] = useState<string | null>(null);
  const first = new Date(month);
  first.setDate(1 - ((month.getDay() + 6) % 7)); // back to Monday
  const days = Array.from({ length: 42 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + i));
  const today = localToday();
  const byDay = new Map<string, Task[]>();
  for (const t of tasks) if (t.due_date) byDay.set(t.due_date, [...(byDay.get(t.due_date) ?? []), t]);
  const undated = tasks.filter((t) => !t.due_date && t.status !== 'done');

  const reschedule = async (taskId: string, date: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.due_date === date) return;
    const updated = await act(() => api.patch<Task>(`/tasks/${taskId}`, { dueDate: date, ...(task.start_date && task.start_date > date ? { startDate: null } : {}) }));
    if (updated) onChanged({ ...task, ...updated });
  };

  const chip = (t: Task) =>
    cn(
      'flex w-full min-w-0 items-center gap-1 rounded-md border-l-2 bg-muted px-1.5 py-0.5 text-left text-xs hover:bg-accent',
      t.status === 'done' ? 'border-success text-muted-foreground line-through' : t.status === 'blocked' ? 'border-destructive' : t.status === 'in_progress' ? 'border-info' : 'border-border',
      t.overdue && 'text-destructive',
    );
  return (
    <Card className="gap-3">
      <CardHeader className="flex flex-wrap items-center gap-2">
        <IconButton label="Previous month" size="icon-sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
          <Icon name="chevronLeft" />
        </IconButton>
        <h3 className="min-w-40 text-center font-heading text-base font-semibold">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3>
        <IconButton label="Next month" size="icon-sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
          <Icon name="chevronRight" />
        </IconButton>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>
          Today
        </Button>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <div className="grid min-w-[42rem] grid-cols-7 overflow-hidden rounded-xl border bg-border [gap:1px]" role="grid">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d} className="bg-muted px-2 py-1.5 text-xs font-medium text-muted-foreground" role="columnheader">
              {d}
            </div>
          ))}
          {days.map((d) => {
            const key = iso(d);
            const items = byDay.get(key) ?? [];
            const other = d.getMonth() !== month.getMonth();
            return (
              <div
                key={key}
                role="gridcell"
                aria-label={d.toDateString()}
                className={cn('flex min-h-24 flex-col gap-1 bg-card p-1.5', other && 'bg-muted/40 text-muted-foreground', dragged && canEdit && 'hover:bg-accent/50')}
                onDragOver={(e) => canEdit && dragged && e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragged) reschedule(dragged, key);
                  setDragged(null);
                }}
              >
                <span className={cn('flex size-6 items-center justify-center rounded-full text-xs', key === today && 'bg-primary font-semibold text-primary-foreground')}>{d.getDate()}</span>
                {items.slice(0, 4).map((t) => (
                  <button
                    key={t.id}
                    className={chip(t)}
                    draggable={canEdit}
                    onDragStart={() => setDragged(t.id)}
                    onClick={() => onOpen(t.id)}
                    title={`${t.title} · ${STATUS_LABEL[t.status]}${t.owner ? ` · ${t.owner.name}` : ''}`}
                  >
                    {t.owner && <Avatar user={t.owner} size="xs" className="size-4 text-[8px]" />}
                    <span className="truncate">{t.title}</span>
                  </button>
                ))}
                {items.length > 4 && <span className="px-1 text-xs text-muted-foreground">+{items.length - 4} more</span>}
              </div>
            );
          })}
        </div>
      </CardContent>
      {undated.length > 0 && (
        <CardFooter>
          <Collapsible className="flex w-full flex-col gap-2">
            <CollapsibleTrigger render={<Button variant="ghost" size="sm" className="self-start" />}>
              <ChevronRight data-icon="inline-start" className="transition-transform in-data-[panel-open]:rotate-90" />
              {undated.length} open task{undated.length === 1 ? '' : 's'} without a due date {canEdit && <span className="text-muted-foreground">— drag one onto a day</span>}
            </CollapsibleTrigger>
            <CollapsibleContent className="flex flex-wrap gap-2">
              {undated.map((t) => (
                <button key={t.id} className={cn(chip(t), 'w-auto max-w-64')} draggable={canEdit} onDragStart={() => setDragged(t.id)} onClick={() => onOpen(t.id)}>
                  <span className="truncate">{t.title}</span> {t.due_date && <span>{dueLabel(t.due_date)}</span>}
                </button>
              ))}
            </CollapsibleContent>
          </Collapsible>
        </CardFooter>
      )}
    </Card>
  );
}
