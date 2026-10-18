import { useState, type FormEvent } from 'react';
import { api, type Task } from '../api';
import { Icon } from '../components/Icon';
import { useShell } from '../components/Layout';
import { TaskRow } from '../components/TaskDrawer';
import { ChevronRight } from 'lucide-react';
import { DatePicker, EmptyState, ErrorState, Loading, Page, PageHeader, Pill, useAction } from '@/components/kit';
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
}

const SECTIONS: { id: keyof MyWorkData; title: string; hint: string; tone?: string }[] = [
  { id: 'overdue', title: 'Overdue', hint: 'Past their due date', tone: 'danger' },
  { id: 'today', title: 'Today', hint: 'Due today or urgent' },
  { id: 'blocked', title: 'Blocked', hint: 'Waiting on something', tone: 'warn' },
  { id: 'review', title: 'Assigned for review', hint: 'Waiting on your review' },
  { id: 'upcoming', title: 'Next 7 days', hint: 'Coming up soon' },
  { id: 'later', title: 'Later', hint: 'No date or further out' },
  { id: 'done_recently', title: 'Done recently', hint: 'Completed in the last day' },
];

export function MyWork() {
  const { openTask } = useShell();
  const act = useAction();
  const { data, error, reload } = useApi<MyWorkData>('/my-work');
  const [title, setTitle] = useState('');
  const [due, setDue] = useState(localToday());
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ done_recently: true });
  useRealtime((e) => (e.type === 'task.updated' || e.type === 'reconnected') && reload());

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await act(() => api.post('/tasks', { title, dueDate: due || null }), 'Task added');
    setTitle('');
    reload();
  };
  const toggle = async (t: Task, done: boolean) => {
    await act(() => api.patch(`/tasks/${t.id}`, { status: done ? 'done' : 'todo' }), done ? 'Nice work — task completed' : 'Task reopened');
    // Waited for, so the ticked box doesn't flick back before the fresh list arrives.
    await reload();
  };

  if (error) return <ErrorState error={error} retry={reload} />;
  if (!data) return <Loading />;
  const total = SECTIONS.filter((s) => s.id !== 'done_recently').reduce((n, s) => n + data[s.id].length, 0);

  return (
    <Page width="narrow">
      <PageHeader title="My work" description="Everything you own or need to review, across every project." />
      <Card size="sm">
        <CardContent>
          <form className="flex flex-wrap items-center gap-2" onSubmit={add}>
            <InputGroup className="min-w-48 flex-1">
              <InputGroupAddon>
                <Icon name="plus" />
              </InputGroupAddon>
              <InputGroupInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a personal task and press Enter" aria-label="New task title" />
            </InputGroup>
            <DatePicker value={due} onChange={(v) => setDue(v ?? '')} aria-label="Due date" placeholder="No date" />
            <Button disabled={!title.trim()} type="submit">
              Add
            </Button>
          </form>
        </CardContent>
      </Card>
      {total === 0 && (
        <EmptyState icon="check" title="You are all clear">
          Nothing assigned to you right now.
        </EmptyState>
      )}
      {SECTIONS.map((s) =>
        data[s.id].length ? (
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
                    <TaskRow key={t.id} task={t} onOpen={() => openTask(t.id)} onToggle={(d) => toggle(t, d)} />
                  ))}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        ) : null,
      )}
    </Page>
  );
}
