import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, type Task } from '@/lib/api';
import { dateLabel, localToday } from '@/lib/format';
import { useApi, useRealtime, useReloadOnFocus } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { useShell } from '@/lib/shell';
import type { SavedView } from '@/lib/taskViews';
import { useTheme } from '@/lib/theme';
import { Icon } from '@/ui/Icon';
import { Badge, Button, Card, Empty, ErrorState, Loading, Muted, Row, Screen, T, Tabs, useAction, useToast } from '@/ui/kit';
import { DateField, PeopleField } from '@/ui/pickers';
import { QuickAddTask } from '@/ui/quickAdd';
import { TaskViewPanel } from '@/ui/taskViews';
import { TaskList } from '@/ui/work';

interface MyWorkData {
  overdue: Task[];
  today: Task[];
  upcoming: Task[];
  later: Task[];
  blocked: Task[];
  review: Task[];
  done_recently: Task[];
  /** Given to one of your teams and not picked up yet. */
  team?: Task[];
}

const SECTIONS: { id: keyof MyWorkData; title: string; hint: string; tone?: 'danger' | 'warn' }[] = [
  { id: 'overdue', title: 'Overdue', hint: 'Past their due date', tone: 'danger' },
  { id: 'today', title: 'Today', hint: 'Due today or urgent' },
  { id: 'blocked', title: 'Blocked', hint: 'Waiting on something', tone: 'warn' },
  { id: 'review', title: 'Assigned for review', hint: 'Waiting on your review' },
  { id: 'team', title: 'For your teams', hint: 'Anyone on the team can take it' },
  { id: 'upcoming', title: 'Next 7 days', hint: 'Coming up soon' },
  { id: 'later', title: 'Later', hint: 'No date or further out' },
  { id: 'done_recently', title: 'Done recently', hint: 'Completed in the last day' },
];

const inDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** Next Monday (or the one after, if today is Monday). */
const nextMonday = () => inDays((8 - new Date().getDay()) % 7 || 7);

type Patch = { status?: string; dueDate?: string | null; ownerId?: string | null };

/** Apply one change to several tasks, a few at a time, through the normal task update. Resolves how many failed. */
async function applyToAll(tasks: Task[], change: (t: Task) => Patch) {
  let failed = 0;
  for (let i = 0; i < tasks.length; i += 5) {
    const results = await Promise.allSettled(tasks.slice(i, i + 5).map((t) => api.patch(`/tasks/${t.id}`, change(t))));
    failed += results.filter((r) => r.status === 'rejected').length;
  }
  return failed;
}

export default function MyWork() {
  const params = useLocalSearchParams<{ view?: string }>();
  const views = useApi<SavedView[]>('/views');
  const [tab, setTab] = useState(params.view ?? 'mine');
  useEffect(() => {
    if (params.view) setTab(params.view);
  }, [params.view]);
  const view = views.data?.find((v) => v.id === tab) ?? null;
  // A view deleted elsewhere (or an old link) falls back to the usual list.
  const showing = tab === 'filter' || view ? tab : 'mine';
  const tabs = (
    <Tabs
      value={showing}
      onChange={setTab}
      tabs={[{ id: 'mine', label: 'My work' }, ...(views.data ?? []).map((v) => ({ id: v.id, label: v.name })), { id: 'filter', label: 'Filter tasks' }]}
    />
  );
  if (showing === 'mine') return <MyWorkLists tabs={tabs} />;
  return (
    <Screen>
      {tabs}
      <TaskViewPanel
        key={showing}
        view={view}
        onSaved={async (v) => {
          await views.reload();
          setTab(v.id);
        }}
        onDeleted={async () => {
          await views.reload();
          setTab('mine');
        }}
      />
    </Screen>
  );
}

function MyWorkLists({ tabs }: { tabs: React.ReactNode }) {
  const { c } = useTheme();
  const { openTask, reloadCounts } = useShell();
  const act = useAction();
  const { data, error, reload, refresh, refreshing } = useApi<MyWorkData>('/my-work');
  const [due, setDue] = useState<string | null>(localToday());
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ done_recently: true });
  // Choosing several tasks to finish, reschedule or hand over at once.
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const stopSelecting = () => {
    setSelecting(false);
    setPicked(new Set());
  };
  useRealtime((e) => (e.type === 'task.updated' || e.type === 'reconnected') && reload());
  useReloadOnFocus(reload);

  const changed = () => {
    reload();
    reloadCounts();
  };
  const toggle = async (t: Task, done: boolean) => {
    await act(() => api.patch(`/tasks/${t.id}`, { status: done ? 'done' : 'todo' }), done ? 'Nice work — task completed' : 'Task reopened');
    // Waited for, so the ticked box doesn't flick back before the fresh list arrives.
    await reload();
    reloadCounts();
  };

  if (error && !data) return <ErrorState error={error} retry={reload} />;
  if (!data) return <Loading />;
  const list = (id: keyof MyWorkData) => data[id] ?? [];
  const total = SECTIONS.filter((s) => s.id !== 'done_recently').reduce((n, s) => n + list(s.id).length, 0);
  const chosen = SECTIONS.flatMap((s) => list(s.id)).filter((t, i, all) => picked.has(t.id) && all.findIndex((x) => x.id === t.id) === i);

  return (
    <View style={{ flex: 1 }}>
      <Screen refreshing={refreshing} onRefresh={refresh} contentStyle={selecting ? { paddingBottom: 200 } : undefined}>
        {tabs}
        <Muted size={14}>Everything you own or need to review — or filter every task you can see and save it as a view.</Muted>
        <Card style={{ gap: 10 }}>
          <QuickAddTask onCreated={changed} defaultDue={due} extra={<DateField value={due} onChange={setDue} label="Due date when none is typed" placeholder="No date" />} />
        </Card>
        {total > 0 && (
          <Button small icon="check" variant={selecting ? 'soft' : 'secondary'} title={selecting ? 'Done selecting' : 'Select tasks'} onPress={() => (selecting ? stopSelecting() : setSelecting(true))} style={{ alignSelf: 'flex-end' }} />
        )}
        {total === 0 && (
          <Empty icon="check" title="You are all clear">
            Nothing assigned to you right now.
          </Empty>
        )}
        {SECTIONS.map((s) =>
          list(s.id).length ? (
            <Card key={s.id} style={s.tone === 'danger' ? { borderColor: c.redLine } : s.tone === 'warn' ? { borderColor: c.amberLine } : undefined}>
              <Pressable onPress={() => setCollapsed({ ...collapsed, [s.id]: !collapsed[s.id] })} accessibilityRole="button" accessibilityState={{ expanded: !collapsed[s.id] }} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon name={collapsed[s.id] ? 'chevronRight' : 'chevronDown'} size={16} color={c.muted} />
                <T size={17} weight="display" style={{ color: s.tone === 'danger' ? c.red : c.ink }}>
                  {s.title}
                </T>
                <Badge count={list(s.id).length} tone={s.tone === 'danger' ? 'red' : 'muted'} />
                <Muted size={12} style={{ flex: 1, textAlign: 'right' }} numberOfLines={1}>
                  {s.hint}
                </Muted>
              </Pressable>
              {!collapsed[s.id] && (
                <TaskList
                  tasks={list(s.id)}
                  onOpen={(t) => openTask(t.id)}
                  onToggle={toggle}
                  selection={
                    selecting
                      ? {
                          picked,
                          onChange: (t, on) => {
                            const next = new Set(picked);
                            if (on) next.add(t.id);
                            else next.delete(t.id);
                            setPicked(next);
                          },
                        }
                      : undefined
                  }
                />
              )}
            </Card>
          ) : null,
        )}
      </Screen>
      {selecting && <BulkBar tasks={chosen} onClear={stopSelecting} onChanged={changed} />}
    </View>
  );
}

/** What can be done to the chosen tasks: finish, reschedule or hand them over, with Undo afterwards. */
function BulkBar({ tasks, onClear, onChanged }: { tasks: Task[]; onClear: () => void; onChanged: () => void }) {
  const { c } = useTheme();
  const { me, people } = useSession();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<{ text: string; run: () => Promise<void> } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const apply = async (patch: Patch, done: string) => {
    if (!tasks.length) return;
    setBusy(true);
    const list = [...tasks];
    const before = new Map(list.map((t) => [t.id, { status: t.status, dueDate: t.due_date, ownerId: t.owner?.id ?? null }]));
    const failed = await applyToAll(list, () => patch);
    setBusy(false);
    onChanged();
    if (failed === list.length) return toast(`Couldn't change ${failed === 1 ? 'that task' : 'those tasks'}`, 'error');
    const changed = list.length - failed;
    clearTimeout(timer.current);
    setUndo({
      text: `${changed} task${changed === 1 ? '' : 's'} ${done}${failed ? ` · ${failed} couldn't be changed` : ''}`,
      run: async () => {
        setUndo(null);
        await applyToAll(list, (t) => {
          const was = before.get(t.id)!;
          return Object.fromEntries(Object.keys(patch).map((k) => [k, was[k as keyof Patch]])) as Patch;
        });
        onChanged();
      },
    });
    timer.current = setTimeout(() => {
      setUndo(null);
      onClear();
    }, 6000);
  };

  const bar = { position: 'absolute' as const, left: 10, right: 10, bottom: insets.bottom + 10, borderRadius: 16, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, padding: 10, gap: 8, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 14, elevation: 6 };

  if (undo)
    return (
      <View style={[bar, { flexDirection: 'row', alignItems: 'center', backgroundColor: c.nav, borderColor: c.nav }]} accessibilityLiveRegion="polite">
        <T size={14} weight="semibold" style={{ flex: 1, color: c.navText }}>
          {undo.text}
        </T>
        <Button small variant="primary" title="Undo" onPress={undo.run} />
        <Pressable
          onPress={() => {
            clearTimeout(timer.current);
            setUndo(null);
            onClear();
          }}
          accessibilityRole="button"
          hitSlop={8}
          style={{ paddingHorizontal: 8, paddingVertical: 6 }}
        >
          <T size={13} weight="bold" style={{ color: c.navText }}>
            OK
          </T>
        </Pressable>
      </View>
    );

  const disabled = busy || !tasks.length;
  return (
    <View style={bar} accessibilityLabel={`${tasks.length} selected tasks`}>
      <Row gap={8}>
        <T weight="bold" style={{ flex: 1 }}>
          {tasks.length ? `${tasks.length} selected` : 'Tap tasks to select them'}
        </T>
        <Button small variant="ghost" title="Cancel" onPress={onClear} />
      </Row>
      <Row gap={6} wrap>
        <Button small variant="primary" icon="check" title="Done" disabled={disabled} onPress={() => apply({ status: 'done' }, 'completed')} />
        <Button small title="Today" disabled={disabled} onPress={() => apply({ dueDate: inDays(0) }, 'moved to today')} />
        <Button small title="Tomorrow" disabled={disabled} onPress={() => apply({ dueDate: inDays(1) }, 'moved to tomorrow')} />
        <Button small title="Next week" disabled={disabled} onPress={() => apply({ dueDate: nextMonday() }, 'moved to next week')} />
      </Row>
      <Row gap={6}>
        <View style={{ flex: 1 }}>
          <DateField value={null} onChange={(v) => v && apply({ dueDate: v }, `moved to ${dateLabel(v)}`)} placeholder="Move to a date" label="Move to a date" disabled={disabled} />
        </View>
        <View style={{ flex: 1 }}>
          <PeopleField
            multiple={false}
            title="Assign to"
            placeholder="Assign to…"
            value={[]}
            disabled={disabled}
            onChange={(ids) => {
              const id = ids[0];
              if (id) apply({ ownerId: id }, `given to ${id === me!.user.id ? 'you' : people.find((p) => p.id === id)?.name ?? 'them'}`);
            }}
          />
        </View>
      </Row>
    </View>
  );
}
