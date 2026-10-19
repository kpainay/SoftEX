import { useState, type ReactNode } from 'react';
import { dateLabel } from '../format';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, type Project, type UserRef } from '../api';
import { Avatar } from '../components/Avatar';
import { FavoriteButton } from '../components/Favorites';
import { Icon } from '../components/Icon';
import { UpgradeNotice, usePlan } from '../components/Plan';
import { DatePicker, EmptyState, ErrorState, FormField, HealthPill, IconButton, Loading, Modal, Page, PageHeader, Pill, Segmented, StatCard, StatGrid, TabBar, useAction, useConfirm } from '@/components/kit';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldLegend, FieldSet } from '@/components/ui/field';
import { Progress as UIProgress } from '@/components/ui/progress';
import { useApi } from '../hooks';
import { useSession } from '../session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

type GoalStatus = 'on_track' | 'at_risk' | 'off_track' | 'done';
interface KeyResult {
  id: string;
  title: string;
  kind: 'number' | 'tasks';
  start_value: number;
  target_value: number;
  current_value: number;
  unit: string;
  project: { id: string; name: string; color: string } | null;
  progress: number;
}
export interface Goal {
  id: string;
  parent_id: string | null;
  title: string;
  description: string;
  owner: UserRef | null;
  due_date: string | null;
  status: GoalStatus;
  progress: number;
  key_results: KeyResult[];
  projects: { id: string; name: string; color: string; health: string }[];
  can_edit: boolean;
  created_at: string;
  archived_at: string | null;
}

const STATUS_LABEL: Record<GoalStatus, string> = { on_track: 'On track', at_risk: 'At risk', off_track: 'Off track', done: 'Achieved' };
const pct = (p: number) => `${Math.round(p * 100)}%`;

function GoalStatusPill({ status }: { status: GoalStatus }) {
  return status === 'done' ? <Pill tone="success">Achieved</Pill> : <HealthPill health={status} />;
}

function Progress({ value, className }: { value: number; className?: string }) {
  return <UIProgress value={Math.round(Math.min(1, Math.max(0, value)) * 100)} className={className} aria-label="Progress" />;
}

const SectionTitle = ({ children, action }: { children: ReactNode; action?: ReactNode }) => (
  <CardHeader>
    <CardTitle>{children}</CardTitle>
    {action && <CardAction>{action}</CardAction>}
  </CardHeader>
);

/** Company and team goals with measurable key results (Asana Goals, Monday OKRs, ClickUp Goals). */
export function Goals() {
  const plan = usePlan();
  const [tab, setTab] = useState<'active' | 'archived'>('active');
  const [creating, setCreating] = useState(false);
  const { data, error, reload } = useApi<Goal[]>(`/goals?archived=${tab === 'archived'}`);
  // Without the feature, goals made earlier (on a trial or a higher plan) stay readable.
  const readOnly = !plan.has('goals');
  if (readOnly && data && !data.length && tab === 'active') {
    return (
      <Page>
        <PageHeader title="Goals" />
        <UpgradeNotice feature="goals" />
      </Page>
    );
  }
  const ids = new Set(data?.map((g) => g.id));
  const roots = (data ?? []).filter((g) => !g.parent_id || !ids.has(g.parent_id));
  const children = (id: string) => (data ?? []).filter((g) => g.parent_id === id);
  const counts = (data ?? []).reduce<Record<string, number>>((acc, g) => ({ ...acc, [g.status]: (acc[g.status] ?? 0) + 1 }), {});

  const renderGoal = (g: Goal, depth: number): ReactNode => (
    <div key={g.id} className="flex flex-col">
      <Link
        to={`/goals/${g.id}`}
        className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-muted/60 sm:grid-cols-[auto_minmax(0,1fr)_10rem_auto_auto]"
        style={{ paddingLeft: 12 + depth * 22 }}
      >
        <Icon name={depth ? 'chevronRight' : 'target'} size={16} className="text-muted-foreground" />
        <span className="flex min-w-0 flex-col">
          <strong className="truncate text-sm font-semibold">{g.title}</strong>
          <span className="text-xs text-muted-foreground">
            {g.key_results.length} key result{g.key_results.length === 1 ? '' : 's'}
            {g.due_date && <> · due {dateLabel(g.due_date)}</>}
          </span>
        </span>
        <span className="flex items-center gap-2 max-sm:hidden">
          <Progress value={g.progress} className="flex-1" />
          <span className="w-9 text-right text-xs tabular-nums">{pct(g.progress)}</span>
        </span>
        <GoalStatusPill status={g.status} />
        <Avatar user={g.owner} size="sm" className="max-sm:hidden" />
      </Link>
      {children(g.id).map((c) => renderGoal(c, depth + 1))}
    </div>
  );

  return (
    <Page>
      <PageHeader
        title="Goals"
        description="What the organisation is aiming for this season, how far along it is, and the projects that get it there."
        actions={
          !readOnly && (
            <Button onClick={() => setCreating(true)}>
              <Icon name="plus" data-icon="inline-start" /> New goal
            </Button>
          )
        }
      />
      {readOnly && <UpgradeNotice feature="goals" compact readOnly />}
      <TabBar
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'active', label: 'Active' },
          { id: 'archived', label: 'Archived' },
        ]}
      />
      {error ? (
        <ErrorState error={error} retry={reload} />
      ) : !data ? (
        <Loading />
      ) : !data.length ? (
        <EmptyState
          icon="target"
          title={tab === 'active' ? 'No goals yet' : 'Nothing archived'}
          action={
            tab === 'active' &&
            !readOnly && (
              <Button onClick={() => setCreating(true)}>
                <Icon name="plus" data-icon="inline-start" /> New goal
              </Button>
            )
          }
        >
          {tab === 'active' && 'Set a goal, add key results you can measure, and link the projects that move it.'}
        </EmptyState>
      ) : (
        <>
          {tab === 'active' && (
            <StatGrid>
              {(['on_track', 'at_risk', 'off_track', 'done'] as GoalStatus[]).map((s) => (
                <StatCard key={s} label={STATUS_LABEL[s]} value={counts[s] ?? 0} tone={s === 'done' || s === 'on_track' ? 'success' : s === 'at_risk' ? 'warning' : 'danger'} />
              ))}
            </StatGrid>
          )}
          <Card className="gap-0 px-1.5 py-1.5">{roots.map((g) => renderGoal(g, 0))}</Card>
        </>
      )}
      {creating && (
        <GoalForm
          goals={data ?? []}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            reload();
          }}
        />
      )}
    </Page>
  );
}

function GoalForm({ goal, goals, onClose, onSaved }: { goal?: Goal; goals: Goal[]; onClose: () => void; onSaved: (g: Goal) => void }) {
  const act = useAction();
  const { people, me } = useSession();
  const { data: projects } = useApi<Project[]>('/projects');
  const [title, setTitle] = useState(goal?.title ?? '');
  const [description, setDescription] = useState(goal?.description ?? '');
  const [ownerId, setOwnerId] = useState(goal?.owner?.id ?? me!.user.id);
  const [dueDate, setDueDate] = useState(goal?.due_date ?? '');
  const [parentId, setParentId] = useState(goal?.parent_id ?? '');
  const [projectIds, setProjectIds] = useState<string[]>(goal?.projects.map((p) => p.id) ?? []);
  return (
    <Modal open onClose={onClose} title={goal ? 'Edit goal' : 'New goal'}>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const body = { title, description, ownerId, dueDate: dueDate || null, parentId: parentId || null, projectIds };
          const saved = await act(() => (goal ? api.patch<Goal>(`/goals/${goal.id}`, body) : api.post<Goal>('/goals', body)), goal ? 'Goal saved' : 'Goal created');
          if (saved) onSaved(saved);
        }}
      >
        <FormField label="Goal">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} placeholder="Reach 5,000 active customers this year" autoFocus />
        </FormField>
        <FormField label="Why it matters">
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Owner">
            <NativeSelect value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              {people.map((p) => (
                <NativeSelectOption key={p.id} value={p.id}>
                  {p.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Due">
            <DatePicker value={dueDate} onChange={(v) => setDueDate(v ?? '')} placeholder="No due date" />
          </FormField>
        </div>
        <FormField label="Part of" hint="Nest team goals under a company goal.">
          <NativeSelect value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <NativeSelectOption value="">Top-level goal</NativeSelectOption>
            {goals
              .filter((g) => g.id !== goal?.id)
              .map((g) => (
                <NativeSelectOption key={g.id} value={g.id}>
                  {g.title}
                </NativeSelectOption>
              ))}
          </NativeSelect>
        </FormField>
        <FieldSet className="gap-2">
          <FieldLegend variant="label">Supporting projects</FieldLegend>
          <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-xl border p-1.5">
            {(projects ?? [])
              .filter((p) => !p.archived_at)
              .map((p) => (
                <Label key={p.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 font-normal hover:bg-muted">
                  <Checkbox checked={projectIds.includes(p.id)} onCheckedChange={(checked) => setProjectIds(checked ? [...projectIds, p.id] : projectIds.filter((x) => x !== p.id))} />
                  <span className="size-2 rounded-full" style={{ background: `var(--c-${p.color})` }} /> {p.name}
                </Label>
              ))}
          </div>
        </FieldSet>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!title.trim()} type="submit">
            {goal ? 'Save' : 'Create goal'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function GoalDetail() {
  const { id } = useParams();
  const act = useAction();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { data: goal, error, reload, setData } = useApi<Goal>(`/goals/${id}`);
  const { data: all } = useApi<Goal[]>('/goals');
  const { data: projects } = useApi<Project[]>('/projects');
  const [editing, setEditing] = useState(false);
  const [addingKr, setAddingKr] = useState(false);
  if (error) return <ErrorState error={error} retry={reload} />;
  if (!goal) return <Loading />;
  const parent = all?.find((g) => g.id === goal.parent_id);
  const subGoals = (all ?? []).filter((g) => g.parent_id === goal.id);
  const update = async (patch: Record<string, unknown>) => {
    const saved = await act(() => api.patch<Goal>(`/goals/${goal.id}`, patch));
    if (saved) setData(saved);
  };

  return (
    <Page width="narrow">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to="/goals" />}>Goals</BreadcrumbLink>
          </BreadcrumbItem>
          {parent && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link to={`/goals/${parent.id}`} />}>{parent.title}</BreadcrumbLink>
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>
      <PageHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            {goal.title} <FavoriteButton kind="goal" id={goal.id} />
          </span>
        }
        actions={
          goal.can_edit && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Icon name="edit" data-icon="inline-start" /> Edit
            </Button>
          )
        }
      >
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <GoalStatusPill status={goal.status} />
          <span>
            Owner: <strong className="text-foreground">{goal.owner?.name}</strong>
          </span>
          {goal.due_date && <span>Due {dateLabel(goal.due_date)}</span>}
          {goal.archived_at && <Pill>Archived</Pill>}
        </div>
      </PageHeader>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <strong className="big-number font-heading text-4xl font-semibold tabular-nums">{pct(goal.progress)}</strong>
            <Progress value={goal.progress} className="h-2.5 flex-1" />
          </div>
          {goal.can_edit && (
            <Segmented
              aria-label="Status"
              value={goal.status}
              onChange={(s) => update({ status: s })}
              options={(['on_track', 'at_risk', 'off_track', 'done'] as GoalStatus[]).map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
            />
          )}
          {goal.description && <p className="text-sm whitespace-pre-wrap">{goal.description}</p>}
        </CardContent>
      </Card>

      <Card>
        <SectionTitle
          action={
            goal.can_edit && (
              <Button variant="ghost" size="sm" onClick={() => setAddingKr(true)}>
                Add
              </Button>
            )
          }
        >
          Key results
        </SectionTitle>
        <CardContent className="flex flex-col gap-1">
          {!goal.key_results.length && <p className="text-sm text-muted-foreground">No key results yet. {goal.projects.length ? 'Progress follows the linked projects’ tasks.' : ''}</p>}
          {goal.key_results.map((kr) => (
            <KeyResultRow key={kr.id} kr={kr} canEdit={goal.can_edit} onChanged={reload} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <SectionTitle>Supporting projects</SectionTitle>
        <CardContent className="flex flex-col gap-1">
          {!goal.projects.length && <p className="text-sm text-muted-foreground">No linked projects.</p>}
          {goal.projects.map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted">
              <span className="size-2 rounded-full" style={{ background: `var(--c-${p.color})` }} /> <span className="min-w-0 flex-1 truncate">{p.name}</span> <HealthPill health={p.health} />
            </Link>
          ))}
        </CardContent>
      </Card>

      {subGoals.length > 0 && (
        <Card>
          <SectionTitle>Sub-goals</SectionTitle>
          <CardContent className="flex flex-col gap-1">
            {subGoals.map((g) => (
              <Link key={g.id} to={`/goals/${g.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted">
                <Icon name="target" size={14} className="text-muted-foreground" /> <span className="min-w-0 flex-1 truncate">{g.title}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{pct(g.progress)}</span> <GoalStatusPill status={g.status} />
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {goal.can_edit && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => update({ archived: !goal.archived_at })}>
            {goal.archived_at ? 'Restore' : 'Archive'}
          </Button>
          <Button
            variant="destructive"
            onClick={async () => {
              if (!(await confirm({ title: 'Delete this goal?', description: 'Its key results are deleted too.', confirmLabel: 'Delete goal', destructive: true }))) return;
              if (await act(() => api.del(`/goals/${goal.id}`), 'Goal deleted')) navigate('/goals');
            }}
          >
            <Icon name="trash" data-icon="inline-start" /> Delete
          </Button>
        </div>
      )}

      {editing && (
        <GoalForm
          goal={goal}
          goals={all ?? []}
          onClose={() => setEditing(false)}
          onSaved={(g) => {
            setData(g);
            setEditing(false);
          }}
        />
      )}
      {addingKr && (
        <KeyResultForm
          goalId={goal.id}
          projects={projects ?? []}
          onClose={() => setAddingKr(false)}
          onSaved={(g) => {
            setData(g);
            setAddingKr(false);
          }}
        />
      )}
    </Page>
  );
}

function KeyResultRow({ kr, canEdit, onChanged }: { kr: KeyResult; canEdit: boolean; onChanged: () => void }) {
  const act = useAction();
  const confirm = useConfirm();
  const fmt = (n: number) => `${Number(n).toLocaleString()}${kr.unit ? ` ${kr.unit}` : ''}`;
  return (
    <div className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-muted/50">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <strong className="text-sm font-semibold">{kr.title}</strong>
        <span className="text-xs text-muted-foreground">
          {kr.kind === 'tasks' ? (
            <>
              {kr.current_value} of {kr.target_value} tasks done{' '}
              {kr.project && (
                <>
                  in{' '}
                  <Link className="text-primary hover:underline" to={`/projects/${kr.project.id}`}>
                    {kr.project.name}
                  </Link>
                </>
              )}
            </>
          ) : (
            <>
              {fmt(kr.current_value)} of {fmt(kr.target_value)} (from {fmt(kr.start_value)})
            </>
          )}
        </span>
        <Progress value={kr.progress} />
      </div>
      {kr.kind === 'number' && (
        <Input
          type="number"
          className="w-24"
          defaultValue={kr.current_value}
          key={kr.current_value}
          aria-label={`Current value of ${kr.title}`}
          onBlur={async (e) => {
            const v = Number(e.target.value);
            if (e.target.value === '' || v === kr.current_value) return;
            await act(() => api.patch(`/key-results/${kr.id}`, { currentValue: v }), 'Progress updated');
            onChanged();
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      )}
      <strong className="w-10 text-right text-sm tabular-nums">{pct(kr.progress)}</strong>
      {canEdit && (
        <IconButton
          label={`Delete ${kr.title}`}
          size="icon-xs"
          onClick={async () => {
            if (!(await confirm({ title: 'Delete this key result?', confirmLabel: 'Delete', destructive: true }))) return;
            await act(() => api.del(`/key-results/${kr.id}`));
            onChanged();
          }}
        >
          <Icon name="x" />
        </IconButton>
      )}
    </div>
  );
}

function KeyResultForm({ goalId, projects, onClose, onSaved }: { goalId: string; projects: Project[]; onClose: () => void; onSaved: (g: Goal) => void }) {
  const act = useAction();
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<'number' | 'tasks'>('number');
  const [start, setStart] = useState('0');
  const [target, setTarget] = useState('100');
  const [unit, setUnit] = useState('');
  const [projectId, setProjectId] = useState('');
  return (
    <Modal open onClose={onClose} title="New key result">
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const body = kind === 'tasks' ? { title, kind, projectId } : { title, kind, startValue: Number(start), targetValue: Number(target), unit };
          const g = await act(() => api.post<Goal>(`/goals/${goalId}/key-results`, body), 'Key result added');
          if (g) onSaved(g);
        }}
      >
        <FormField label="Key result">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} placeholder="Sign 40 new schools" autoFocus />
        </FormField>
        <Segmented
          aria-label="Measured by"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'number', label: 'A number' },
            { value: 'tasks', label: 'Tasks done in a project' },
          ]}
        />
        {kind === 'number' ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Start">
              <Input type="number" value={start} onChange={(e) => setStart(e.target.value)} required />
            </FormField>
            <FormField label="Target">
              <Input type="number" value={target} onChange={(e) => setTarget(e.target.value)} required />
            </FormField>
            <FormField label="Unit">
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={20} placeholder="schools, %, US$" />
            </FormField>
          </div>
        ) : (
          <FormField label="Project">
            <NativeSelect value={projectId} onChange={(e) => setProjectId(e.target.value)} required>
              <NativeSelectOption value="">Choose a project…</NativeSelectOption>
              {projects
                .filter((p) => !p.archived_at)
                .map((p) => (
                  <NativeSelectOption key={p.id} value={p.id}>
                    {p.name}
                  </NativeSelectOption>
                ))}
            </NativeSelect>
          </FormField>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!title.trim()} type="submit">
            Add
          </Button>
        </div>
      </form>
    </Modal>
  );
}
