import { useEffect, useMemo, useState } from 'react';
import { api, type Project, type Task } from '../api';
import { useApi, useRealtime } from '../hooks';
import { usePeople, useSession } from '../session';
import {
  DUE_OPTIONS,
  PRIORITY_OPTIONS,
  STATUS_OPTIONS,
  cleanFilters,
  describeFilters,
  filtersToQuery,
  hasFilters,
  sameFilters,
  type DueFilter,
  type SavedView,
  type TaskFilters,
} from '../taskViews';
import { Icon } from './Icon';
import { useShell } from './Layout';
import { TaskRow } from './TaskDrawer';
import { EmptyState, FilterChips, FormField, LoadingRows, Modal, SearchField, useAction, useConfirm } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

/** Waits until typing pauses before searching. */
function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Name lookups for describing a view ("Maya Singh · Brand refresh"). */
export function useFilterNames() {
  const people = usePeople();
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

/**
 * Filter every task you can see, and keep the filters as a view. With `view`, it edits that saved view
 * (Save changes, Rename, Delete); without, Save as view creates a new one.
 */
export function TaskViewPanel({ view, onSaved, onDeleted }: { view: SavedView | null; onSaved: (v: SavedView) => void; onDeleted?: () => void }) {
  const { me } = useSession();
  const people = usePeople();
  const names = useFilterNames();
  const { openTask } = useShell();
  const act = useAction();
  const confirm = useConfirm();
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
    if (!view) return;
    setFilters(view.filters);
    setSearch(view.filters.q ?? '');
  }, [view?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch: Partial<TaskFilters>) => setFilters({ ...filters, ...patch });
  const changed = !!view && !sameFilters(view.filters, current);
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
    const saved = await act(() => api.patch<SavedView>(`/views/${view!.id}`, { filters: current }), 'View updated');
    if (saved) onSaved(saved);
  };
  const remove = async () => {
    if (!(await confirm({ title: `Delete “${view!.name}”?`, description: 'Only the view goes; the tasks stay as they are.', confirmLabel: 'Delete view', destructive: true }))) return;
    if (await act(() => api.del(`/views/${view!.id}`), 'View deleted')) onDeleted?.();
  };

  return (
    <>
      <Card size="sm">
        <CardContent className="flex flex-col gap-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <SearchField value={search} onChange={setSearch} placeholder="Search task titles" className="max-w-none sm:col-span-2 lg:col-span-1" />
            <NativeSelect value={filters.ownerId ?? ''} onChange={(e) => set({ ownerId: e.target.value || undefined })} aria-label="Assignee" className="w-full">
              <NativeSelectOption value="">Anyone</NativeSelectOption>
              <NativeSelectOption value="me">Me</NativeSelectOption>
              <NativeSelectOption value="none">Unassigned</NativeSelectOption>
              {people
                .filter((p) => p.id !== me!.user.id)
                .map((p) => (
                  <NativeSelectOption key={p.id} value={p.id}>
                    {p.name}
                  </NativeSelectOption>
                ))}
            </NativeSelect>
            <NativeSelect value={filters.due ?? ''} onChange={(e) => set({ due: (e.target.value || undefined) as DueFilter | undefined })} aria-label="Due" className="w-full">
              <NativeSelectOption value="">Any due date</NativeSelectOption>
              {DUE_OPTIONS.map((o) => (
                <NativeSelectOption key={o.value} value={o.value}>
                  {o.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <NativeSelect value={filters.projectId ?? ''} onChange={(e) => set({ projectId: e.target.value || undefined })} aria-label="Project" className="w-full">
              <NativeSelectOption value="">Any project</NativeSelectOption>
              {names.projectList.map((p) => (
                <NativeSelectOption key={p.id} value={p.id}>
                  {p.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {names.teamList.length > 0 && (
              <NativeSelect value={filters.teamId ?? ''} onChange={(e) => set({ teamId: e.target.value || undefined })} aria-label="Team" className="w-full">
                <NativeSelectOption value="">Any team</NativeSelectOption>
                {names.teamList.map((t) => (
                  <NativeSelectOption key={t.id} value={t.id}>
                    {t.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="w-16 text-xs font-medium text-muted-foreground" aria-hidden>
              Status
            </span>
            <FilterChips aria-label="Status" options={STATUS_OPTIONS} value={filters.statuses ?? []} onChange={(v) => set({ statuses: v })} />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="w-16 text-xs font-medium text-muted-foreground" aria-hidden>
              Priority
            </span>
            <FilterChips aria-label="Priority" options={PRIORITY_OPTIONS} value={filters.priorities ?? []} onChange={(v) => set({ priorities: v })} />
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <p className="min-w-0 flex-1 basis-48 text-sm text-muted-foreground">
              <span className="sr-only">Showing: </span>
              {description}
              {tasks && ` — ${tasks.length} task${tasks.length === 1 ? '' : 's'}`}
            </p>
            {hasFilters(current) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilters({});
                  setSearch('');
                }}
              >
                Clear filters
              </Button>
            )}
            {view ? (
              <>
                {changed && (
                  <Button size="sm" onClick={update}>
                    Save changes
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setName(view.name);
                    setNaming('rename');
                  }}
                >
                  Rename
                </Button>
                <Button variant="outline" size="sm" onClick={remove}>
                  <Icon name="trash" data-icon="inline-start" /> Delete
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                onClick={() => {
                  setName(description === 'All tasks' ? '' : description.slice(0, 60));
                  setNaming('new');
                }}
              >
                <Icon name="plus" data-icon="inline-start" /> Save as view
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card size="sm" aria-label="Matching tasks" role="region">
        <CardContent className="flex flex-col">
          {!tasks && <LoadingRows rows={4} />}
          {tasks?.map((t) => (
            <TaskRow key={t.id} task={t} onOpen={() => openTask(t.id)} onToggle={(d) => toggle(t, d)} />
          ))}
          {tasks && !tasks.length && (
            <EmptyState icon="task" title="No tasks match">
              Try fewer filters.
            </EmptyState>
          )}
        </CardContent>
      </Card>

      <Modal open={!!naming} onClose={() => setNaming(null)} title={naming === 'rename' ? 'Rename view' : 'Save view'} description={naming === 'new' ? description : undefined}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) save();
          }}
        >
          <FormField label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus placeholder="e.g. Urgent this week" />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setNaming(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              {naming === 'rename' ? 'Rename' : 'Save view'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
