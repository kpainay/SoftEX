import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { api, type Project, type Task } from '../lib/api';
import { useApi, useDebounced, useRealtime } from '../lib/hooks';
import { useSession } from '../lib/session';
import { useShell } from '../lib/shell';
import { DUE_OPTIONS, PRIORITY_OPTIONS, STATUS_OPTIONS, cleanFilters, describeFilters, filtersToQuery, hasFilters, sameFilters, type DueFilter, type SavedView, type TaskFilters, type TaskPriority, type TaskStatus } from '../lib/taskViews';
import { Button, Card, ChoiceChips, confirm, Empty, Field, Input, Loading, Muted, Row, SearchBox, Select, Sheet, useAction } from './kit';
import { TaskList } from './work';

/** Name lookups for describing a view ("Maya Singh · Brand refresh"). */
function useFilterNames() {
  const { people } = useSession();
  const { data: projects } = useApi<Project[]>('/projects');
  const { data: teams } = useApi<{ id: string; name: string }[]>('/teams');
  return useMemo(
    () => ({
      people: new Map(people.map((p) => [p.id, p.name])),
      projects: new Map((projects ?? []).map((p) => [p.id, p.name])),
      teams: new Map((teams ?? []).map((t) => [t.id, t.name])),
      projectList: projects ?? [],
      teamList: teams ?? [],
    }),
    [people, projects, teams],
  );
}

const chips = <V extends string>(options: { value: V; label: string }[]) => options.map((o) => ({ id: o.value, label: o.label }));

/**
 * Filter every task you can see, and keep the filters as a view (as on the web). With `view`, it edits that
 * saved view (Save changes, Rename, Delete); without, Save as view creates a new one.
 */
export function TaskViewPanel({ view, onSaved, onDeleted }: { view: SavedView | null; onSaved: (v: SavedView) => void; onDeleted?: () => void }) {
  const { me, people } = useSession();
  const names = useFilterNames();
  const { openTask } = useShell();
  const act = useAction();
  const [filters, setFilters] = useState<TaskFilters>(view?.filters ?? { ownerId: 'me', statuses: ['todo', 'in_progress', 'blocked', 'review'] });
  const [search, setSearch] = useState(view?.filters.q ?? '');
  const [naming, setNaming] = useState<'new' | 'rename' | null>(null);
  const [name, setName] = useState('');
  const q = useDebounced(search);
  const current = useMemo(() => cleanFilters({ ...filters, q }), [filters, q]);
  const { data: tasks, reload } = useApi<Task[]>(`/tasks${filtersToQuery(current)}`);
  useRealtime((e) => (e.type === 'task.updated' || e.type === 'reconnected') && reload());

  // Switching to another view starts from its filters.
  useEffect(() => {
    const saved = view?.filters;
    if (!saved) return;
    setFilters(saved);
    setSearch(saved.q ?? '');
  }, [view?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch: Partial<TaskFilters>) => setFilters({ ...filters, ...patch });
  // Optional chains rather than `view &&` guards: the React Compiler can read a guarded property early when memoising.
  const viewFilters = view?.filters;
  const changed = !!viewFilters && !sameFilters(viewFilters, current);
  const description = describeFilters(current, names);

  const toggle = async (t: Task, done: boolean) => {
    await act(() => api.patch(`/tasks/${t.id}`, { status: done ? 'done' : 'todo' }), done ? 'Task completed' : 'Task reopened');
    await reload();
  };
  const save = async () => {
    const saved = await act(
      () => (naming === 'rename' && view ? api.patch<SavedView>(`/views/${view.id}`, { name }) : api.post<SavedView>('/views', { name, filters: current })),
      naming === 'rename' ? 'View renamed' : 'View saved',
    );
    if (saved) {
      setNaming(null);
      onSaved(saved);
    }
  };
  const update = async () => {
    const saved = await act(() => api.patch<SavedView>(`/views/${view?.id}`, { filters: current }), 'View updated');
    if (saved) onSaved(saved);
  };
  const remove = async () => {
    if (!(await confirm(`Delete “${view?.name}”?`, 'Only the view goes; the tasks stay as they are.', 'Delete view'))) return;
    if (await act(() => api.del(`/views/${view?.id}`), 'View deleted')) onDeleted?.();
  };

  return (
    <>
      <Card style={{ gap: 12 }}>
        <SearchBox value={search} onChangeText={setSearch} placeholder="Search task titles" />
        <Row gap={8}>
          <View style={{ flex: 1 }}>
            <Select
              title="Assignee"
              value={filters.ownerId ?? ''}
              onChange={(v) => set({ ownerId: v || undefined })}
              options={[
                { id: '', label: 'Anyone' },
                { id: 'me', label: 'Me' },
                { id: 'none', label: 'Unassigned' },
                ...people.filter((p) => p.id !== me!.user.id).map((p) => ({ id: p.id, label: p.name })),
              ]}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Select title="Due" value={filters.due ?? ''} onChange={(v) => set({ due: (v || undefined) as DueFilter | undefined })} options={[{ id: '', label: 'Any due date' }, ...chips(DUE_OPTIONS)]} />
          </View>
        </Row>
        <Row gap={8}>
          <View style={{ flex: 1 }}>
            <Select title="Project" value={filters.projectId ?? ''} onChange={(v) => set({ projectId: v || undefined })} options={[{ id: '', label: 'Any project' }, ...names.projectList.map((p) => ({ id: p.id, label: p.name }))]} />
          </View>
          {names.teamList.length > 0 && (
            <View style={{ flex: 1 }}>
              <Select title="Team" value={filters.teamId ?? ''} onChange={(v) => set({ teamId: v || undefined })} options={[{ id: '', label: 'Any team' }, ...names.teamList.map((t) => ({ id: t.id, label: t.name }))]} />
            </View>
          )}
        </Row>
        <Field label="Status">
          <ChoiceChips options={chips(STATUS_OPTIONS)} value={filters.statuses ?? []} onChange={(v: TaskStatus[]) => set({ statuses: v })} />
        </Field>
        <Field label="Priority">
          <ChoiceChips options={chips(PRIORITY_OPTIONS)} value={filters.priorities ?? []} onChange={(v: TaskPriority[]) => set({ priorities: v })} />
        </Field>
        <Muted size={13}>
          {description}
          {tasks && ` — ${tasks.length} task${tasks.length === 1 ? '' : 's'}`}
        </Muted>
        <Row gap={8} wrap>
          {view ? (
            <>
              {changed && <Button small variant="primary" title="Save changes" onPress={update} />}
              <Button
                small
                title="Rename"
                onPress={() => {
                  setName(view?.name ?? '');
                  setNaming('rename');
                }}
              />
              <Button small icon="trash" title="Delete" onPress={remove} />
            </>
          ) : (
            <Button
              small
              variant="primary"
              icon="plus"
              title="Save as view"
              onPress={() => {
                setName(description === 'All tasks' ? '' : description.slice(0, 60));
                setNaming('new');
              }}
            />
          )}
          {hasFilters(current) && (
            <Button
              small
              variant="ghost"
              title="Clear filters"
              onPress={() => {
                setFilters({});
                setSearch('');
              }}
            />
          )}
        </Row>
      </Card>

      <Card>
        {!tasks ? (
          <Loading inline />
        ) : (
          <TaskList
            tasks={tasks}
            onOpen={(t) => openTask(t.id)}
            onToggle={toggle}
            empty={
              <Empty icon="task" title="No tasks match">
                Try fewer filters.
              </Empty>
            }
          />
        )}
      </Card>

      <Sheet
        open={!!naming}
        onClose={() => setNaming(null)}
        title={naming === 'rename' ? 'Rename view' : 'Save view'}
        footer={<Button title={naming === 'rename' ? 'Rename' : 'Save view'} variant="primary" full disabled={!name.trim()} onPress={save} />}
      >
        {naming === 'new' && <Muted>{description}</Muted>}
        <Field label="Name">
          <Input value={name} onChangeText={setName} maxLength={60} autoFocus placeholder="e.g. Urgent this week" returnKeyType="done" onSubmitEditing={() => name.trim() && save()} />
        </Field>
      </Sheet>
    </>
  );
}
