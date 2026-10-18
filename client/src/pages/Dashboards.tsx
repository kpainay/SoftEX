import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, type CustomField, type Feature, type Project } from '../api';
import { BarChart, DonutChart, LineChart, type SeriesItem } from '../components/Charts';
import { FavoriteButton } from '../components/Favorites';
import { Icon } from '../components/Icon';
import { useShell } from '../components/Layout';
import { Markdown } from '../components/Markdown';
import { UpgradeNotice, usePlan } from '../components/Plan';
import { Callout, EmptyState, ErrorState, FormField, HealthPill, IconButton, Loading, Modal, Page, PageHeader, Pill, StatusPill, useAction, useConfirm } from '@/components/kit';
import { DueLabel } from '../components/TaskDrawer';
import { ButtonGroup } from '@/components/ui/button-group';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldDescription, FieldLegend, FieldSet } from '@/components/ui/field';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { timeAgo } from '../format';
import { useApi, useRealtime } from '../hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

type WidgetType = 'number' | 'status' | 'priority' | 'owner' | 'label' | 'field' | 'trend' | 'time' | 'goals' | 'projects' | 'due' | 'note';
type Metric = 'open' | 'overdue' | 'blocked' | 'done_week' | 'due_week' | 'hours_week' | 'field_sum';

export interface Widget {
  id: string;
  type: WidgetType;
  title: string;
  size: 'half' | 'full';
  chart?: 'bar' | 'donut';
  projectIds: string[];
  metric?: Metric;
  fieldId?: string;
  weeks?: number;
  text?: string;
}

interface Dashboard {
  id: string;
  name: string;
  description: string;
  visibility: 'private' | 'workspace';
  owner: { id: string; name: string } | null;
  widgets: Widget[];
  can_edit: boolean;
  updated_at: string;
}

type WidgetData =
  | { kind: 'number'; value: number; unit: string; tone?: 'good' | 'bad' | 'warn'; note?: string }
  | { kind: 'series'; items: SeriesItem[]; unit?: string }
  | { kind: 'trend'; labels: string[]; series: { key: string; label: string; values: number[] }[] }
  | {
      kind: 'list';
      items: { id: string; title: string; link?: string; task?: boolean; progress?: number; status?: string; owner?: string | null; color?: string; detail?: string; due_date?: string; overdue?: boolean }[];
    }
  | { kind: 'note' }
  | { kind: 'locked'; feature: Feature }
  | { kind: 'empty'; reason?: string };

export const WIDGET_LABEL: Record<WidgetType, string> = {
  number: 'Number',
  status: 'Tasks by status',
  priority: 'Open tasks by priority',
  owner: 'Open tasks by owner',
  label: 'Open tasks by label',
  field: 'Open tasks by a dropdown field',
  trend: 'Created vs completed (weekly)',
  time: 'Hours logged by person',
  goals: 'Goal progress',
  projects: 'Project progress and health',
  due: 'Due soon and overdue',
  note: 'Text note',
};

const METRIC_LABEL: Record<Metric, string> = {
  open: 'Open tasks',
  overdue: 'Overdue tasks',
  blocked: 'Blocked tasks',
  done_week: 'Completed this week',
  due_week: 'Due this week',
  hours_week: 'Hours logged this week',
  field_sum: 'Sum of a number field',
};

const CHARTABLE: WidgetType[] = ['status', 'priority', 'owner', 'label', 'field', 'time'];

/** Dashboards: pages of charts over the work you can see (Monday, Asana, ClickUp dashboards). */
export function Dashboards() {
  const plan = usePlan();
  const navigate = useNavigate();
  const act = useAction();
  const { data, error, reload } = useApi<(Omit<Dashboard, 'widgets' | 'owner'> & { owner_name: string })[]>('/dashboards');
  // Without the feature, dashboards made earlier stay viewable.
  const readOnly = !plan.has('insights');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<'workspace' | 'private'>('workspace');
  if (readOnly && data && !data.length) {
    return (
      <Page>
        <PageHeader title="Dashboards" />
        <UpgradeNotice feature="insights" />
      </Page>
    );
  }
  return (
    <Page>
      <PageHeader
        title="Dashboards"
        description="Charts over tasks, time and goals. Everyone sees numbers from the projects they can open, so sharing a dashboard never shares private work."
        actions={
          !readOnly && (
            <Button onClick={() => setCreating(true)}>
              <Icon name="plus" data-icon="inline-start" /> New dashboard
            </Button>
          )
        }
      />
      {readOnly && <UpgradeNotice feature="insights" compact readOnly />}
      {error ? (
        <ErrorState error={error} retry={reload} />
      ) : !data ? (
        <Loading />
      ) : !data.length ? (
        <EmptyState
          icon="chart"
          title="No dashboards yet"
          action={
            <Button onClick={() => setCreating(true)}>
              <Icon name="plus" data-icon="inline-start" /> New dashboard
            </Button>
          }
        >
          Create one to see open work, overdue tasks, progress and trends at a glance. It starts with useful charts you can change.
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((d) => (
            <Link key={d.id} to={`/dashboards/${d.id}`} className="group/dash rounded-[min(var(--radius-4xl),24px)] outline-none focus-visible:ring-3 focus-visible:ring-ring/40">
              <Card size="sm" className="h-full transition-shadow group-hover/dash:shadow-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                      <Icon name="chart" size={16} />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{d.name}</span>
                    {d.visibility === 'private' && <Icon name="lock" size={14} label="Private" className="text-muted-foreground" />}
                  </CardTitle>
                  {d.description && <CardDescription className="line-clamp-2">{d.description}</CardDescription>}
                </CardHeader>
                <CardFooter className="mt-auto text-xs text-muted-foreground">
                  {d.owner_name} · updated {timeAgo(d.updated_at)}
                </CardFooter>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <Modal open={creating} onClose={() => setCreating(false)} title="New dashboard">
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const d = await act(() => api.post<Dashboard>('/dashboards', { name, visibility }));
            if (d) navigate(`/dashboards/${d.id}`);
          }}
        >
          <FormField label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} placeholder="Operations this quarter" autoFocus />
          </FormField>
          <FormField label="Who can open it">
            <NativeSelect value={visibility} onChange={(e) => setVisibility(e.target.value as 'workspace' | 'private')}>
              <NativeSelectOption value="workspace">Everyone in the workspace (each sees their own data)</NativeSelectOption>
              <NativeSelectOption value="private">Only me</NativeSelectOption>
            </NativeSelect>
          </FormField>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button disabled={!name.trim()} type="submit">
              Create
            </Button>
          </div>
        </form>
      </Modal>
    </Page>
  );
}

export function DashboardView() {
  const { id } = useParams();
  const act = useAction();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { data: dash, error, reload, setData } = useApi<Dashboard>(`/dashboards/${id}`);
  const { data: values, reload: reloadData } = useApi<{ computed_at: string; widgets: Record<string, WidgetData> }>(`/dashboards/${id}/data`);
  const [editing, setEditing] = useState(false);
  const [editWidget, setEditWidget] = useState<Widget | 'new' | null>(null);
  const [renaming, setRenaming] = useState(false);
  const refresh = useRef<number | undefined>(undefined);

  // Keep numbers current as work changes, without refetching on every single event.
  useRealtime((e) => {
    if (e.type !== 'task.updated' && e.type !== 'reconnected') return;
    window.clearTimeout(refresh.current);
    refresh.current = window.setTimeout(reloadData, 1500);
  });
  useEffect(() => () => window.clearTimeout(refresh.current), []);

  if (error) return <ErrorState error={error} retry={reload} />;
  if (!dash) return <Loading />;

  const save = async (widgets: Widget[]) => {
    setData({ ...dash, widgets });
    const saved = await act(() => api.patch<Dashboard>(`/dashboards/${dash.id}`, { widgets }));
    if (saved) setData(saved);
    reloadData();
  };
  const move = (i: number, by: number) => {
    const next = [...dash.widgets];
    const [w] = next.splice(i, 1);
    next.splice(Math.max(0, Math.min(next.length, i + by)), 0, w);
    save(next);
  };

  return (
    <Page width="full" className="max-w-7xl">
      <PageHeader
        eyebrow={
          <>
            <Link to="/dashboards" className="hover:underline">
              Dashboards
            </Link>{' '}
            {dash.visibility === 'private' && '· Private'}
          </>
        }
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            {dash.name} <FavoriteButton kind="dashboard" id={dash.id} />
          </span>
        }
        description={dash.description || undefined}
        actions={
          <>
            <IconButton label="Refresh numbers" variant="outline" onClick={reloadData}>
              <Icon name="refresh" />
            </IconButton>
            {dash.can_edit && (
              <>
                {editing && (
                  <Button variant="outline" onClick={() => setEditWidget('new')}>
                    <Icon name="plus" data-icon="inline-start" /> Add widget
                  </Button>
                )}
                <Button variant={editing ? 'default' : 'outline'} onClick={() => setEditing((e) => !e)}>
                  <Icon name={editing ? 'check' : 'edit'} data-icon="inline-start" /> {editing ? 'Done' : 'Edit'}
                </Button>
              </>
            )}
          </>
        }
      >
        <p className="text-xs text-muted-foreground">Updated {values ? timeAgo(values.computed_at) : '…'} · numbers reflect the projects you can open</p>
      </PageHeader>

      {editing && (
        <Callout
          tone="info"
          title="Editing this dashboard"
          action={
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={() => setRenaming(true)}>
                Rename or share
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={async () => {
                  if (!(await confirm({ title: 'Delete this dashboard?', description: 'The work it shows is not affected.', confirmLabel: 'Delete dashboard', destructive: true }))) return;
                  if (await act(() => api.del(`/dashboards/${dash.id}`), 'Dashboard deleted')) navigate('/dashboards');
                }}
              >
                <Icon name="trash" data-icon="inline-start" /> Delete
              </Button>
            </div>
          }
        >
          Move, edit or remove widgets, then choose Done.
        </Callout>
      )}

      {!dash.widgets.length && (
        <EmptyState icon="chart" title="This dashboard is empty">
          {dash.can_edit ? 'Choose Edit, then Add widget.' : 'Its owner has not added any charts yet.'}
        </EmptyState>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {dash.widgets.map((w, i) => (
          <Card
            key={w.id}
            role="region"
            aria-label={w.title || WIDGET_LABEL[w.type]}
            className={cn('dash-widget gap-3', w.size === 'full' ? 'col-span-full' : w.type === 'number' ? 'col-span-1' : 'md:col-span-2')}
          >
            <CardHeader>
              <CardTitle className="text-sm">{w.title || (w.type === 'number' ? METRIC_LABEL[w.metric ?? 'open'] : WIDGET_LABEL[w.type])}</CardTitle>
              {editing && (
                <CardAction>
                  <ButtonGroup>
                    <IconButton label="Move earlier" variant="outline" size="icon-xs" disabled={i === 0} onClick={() => move(i, -1)}>
                      <Icon name="chevronLeft" />
                    </IconButton>
                    <IconButton label="Move later" variant="outline" size="icon-xs" disabled={i === dash.widgets.length - 1} onClick={() => move(i, 1)}>
                      <Icon name="chevronRight" />
                    </IconButton>
                    <IconButton label={`Edit ${w.title || WIDGET_LABEL[w.type]}`} variant="outline" size="icon-xs" onClick={() => setEditWidget(w)}>
                      <Icon name="edit" />
                    </IconButton>
                    <IconButton label="Remove widget" variant="outline" size="icon-xs" onClick={() => save(dash.widgets.filter((x) => x.id !== w.id))}>
                      <Icon name="x" />
                    </IconButton>
                  </ButtonGroup>
                </CardAction>
              )}
            </CardHeader>
            <CardContent className="flex-1">
              <WidgetBody widget={w} data={values?.widgets[w.id]} />
            </CardContent>
          </Card>
        ))}
      </div>

      {editWidget && (
        <WidgetEditor
          widget={editWidget === 'new' ? null : editWidget}
          onClose={() => setEditWidget(null)}
          onSave={(w) => {
            setEditWidget(null);
            const exists = dash.widgets.some((x) => x.id === w.id);
            save(exists ? dash.widgets.map((x) => (x.id === w.id ? w : x)) : [...dash.widgets, w]);
          }}
        />
      )}
      {renaming && (
        <DashboardSettings
          dash={dash}
          onClose={() => setRenaming(false)}
          onSaved={(d) => {
            setData(d);
            setRenaming(false);
          }}
        />
      )}
    </Page>
  );
}

function WidgetBody({ widget: w, data }: { widget: Widget; data: WidgetData | undefined }) {
  const { openTask } = useShell();
  if (w.type === 'note') return w.text ? <Markdown text={w.text} compact /> : <p className="text-sm text-muted-foreground">Empty note.</p>;
  if (!data) return <Skeleton className="h-32 w-full" aria-busy="true" />;
  switch (data.kind) {
    case 'number':
      return (
        <div className="big-metric flex flex-col gap-1">
          <strong
            className={cn(
              'font-heading text-4xl font-semibold tabular-nums',
              data.tone === 'good' && 'text-success',
              data.tone === 'bad' && 'text-destructive',
              data.tone === 'warn' && 'text-warning',
            )}
          >
            {data.value.toLocaleString()}
          </strong>
          <span className="text-xs text-muted-foreground">
            {data.unit}
            {data.note && ` · ${data.note}`}
          </span>
        </div>
      );
    case 'series': {
      const total = data.items.reduce((s, i) => s + i.value, 0);
      if (!total) return <p className="text-sm text-muted-foreground">Nothing to show yet.</p>;
      const donut = (w.chart ?? (w.type === 'status' || w.type === 'field' ? 'donut' : 'bar')) === 'donut';
      return donut ? <DonutChart items={data.items} label={data.unit ?? 'tasks'} /> : <BarChart items={data.items} unit={data.unit} />;
    }
    case 'trend':
      return <LineChart labels={data.labels} series={data.series} />;
    case 'list':
      if (!data.items.length) return <p className="text-sm text-muted-foreground">Nothing here.</p>;
      return (
        <ul className="flex flex-col divide-y">
          {data.items.map((item) =>
            item.task ? (
              <li key={item.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <Button variant="link" size="inline" className="min-w-0 flex-1 justify-start truncate text-left text-foreground" onClick={() => openTask(item.id)}>
                  {item.title}
                </Button>
                {item.owner && <span className="text-xs text-muted-foreground">{item.owner}</span>}
                {item.status && item.status !== 'todo' && <StatusPill status={item.status} />}
                {item.due_date && <DueLabel due={item.due_date} overdue={item.overdue} />}
              </li>
            ) : (
              <li key={item.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <Link to={item.link ?? '#'} className="flex min-w-0 flex-1 items-center gap-1.5 hover:underline">
                  {item.color && <span className="size-2 shrink-0 rounded-full" style={{ background: `var(--c-${item.color})` }} />}
                  <span className="truncate">{item.title}</span>
                  {item.detail && <span className="text-xs text-muted-foreground"> · {item.detail}</span>}
                </Link>
                {item.progress !== undefined && (
                  <span className="flex w-32 items-center gap-2">
                    <Progress value={Math.round(item.progress * 100)} className="flex-1" aria-label={`${item.title} progress`} />
                    <span className="w-8 text-right text-xs tabular-nums">{Math.round(item.progress * 100)}%</span>
                  </span>
                )}
                {item.status && (item.status === 'done' ? <Pill tone="success">Achieved</Pill> : <HealthPill health={item.status} />)}
              </li>
            ),
          )}
        </ul>
      );
    case 'locked':
      return <UpgradeNotice feature={data.feature} compact />;
    case 'empty':
      return <p className="text-sm text-muted-foreground">{data.reason ?? 'Nothing to show.'}</p>;
    default:
      return null;
  }
}

function WidgetEditor({ widget, onClose, onSave }: { widget: Widget | null; onClose: () => void; onSave: (w: Widget) => void }) {
  const { data: projects } = useApi<Project[]>('/projects');
  const [w, setW] = useState<Widget>(widget ?? { id: `w${Date.now().toString(36)}`, type: 'status', title: '', size: 'half', projectIds: [] });
  const [fields, setFields] = useState<CustomField[]>([]);
  const set = (patch: Partial<Widget>) => setW((x) => ({ ...x, ...patch }));
  const needsField = w.type === 'field' || (w.type === 'number' && w.metric === 'field_sum');

  // Fields come from the chosen projects.
  useEffect(() => {
    if (!needsField || !w.projectIds.length) return setFields([]);
    let live = true;
    Promise.all(w.projectIds.map((p) => api.get<CustomField[]>(`/projects/${p}/fields`).catch(() => [])))
      .then((lists) => live && setFields(lists.flat()))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [needsField, w.projectIds]);
  const fieldOptions = fields.filter((f) => (w.type === 'field' ? f.type === 'select' : f.type === 'number'));

  return (
    <Modal open onClose={onClose} title={widget ? 'Edit widget' : 'Add widget'}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            ...w,
            chart: CHARTABLE.includes(w.type) ? w.chart : undefined,
            metric: w.type === 'number' ? w.metric ?? 'open' : undefined,
            fieldId: needsField ? w.fieldId : undefined,
            weeks: w.type === 'trend' || w.type === 'time' ? w.weeks ?? (w.type === 'trend' ? 8 : 4) : undefined,
            text: w.type === 'note' ? w.text ?? '' : undefined,
          });
        }}
      >
        <FormField label="Show">
          <NativeSelect value={w.type} onChange={(e) => set({ type: e.target.value as WidgetType, size: e.target.value === 'trend' ? 'full' : w.size })}>
            {(Object.keys(WIDGET_LABEL) as WidgetType[]).map((t) => (
              <NativeSelectOption key={t} value={t}>
                {WIDGET_LABEL[t]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
        {w.type === 'number' && (
          <FormField label="Measure">
            <NativeSelect value={w.metric ?? 'open'} onChange={(e) => set({ metric: e.target.value as Metric })}>
              {(Object.keys(METRIC_LABEL) as Metric[]).map((m) => (
                <NativeSelectOption key={m} value={m}>
                  {METRIC_LABEL[m]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </FormField>
        )}
        <FormField label="Title" hint="Leave empty to use the default.">
          <Input value={w.title} onChange={(e) => set({ title: e.target.value })} maxLength={80} />
        </FormField>
        {w.type === 'note' && (
          <FormField label="Text" hint="Markdown works.">
            <Textarea rows={5} value={w.text ?? ''} onChange={(e) => set({ text: e.target.value })} maxLength={4000} />
          </FormField>
        )}
        {w.type !== 'note' && (
          <FieldSet className="gap-2">
            <FieldLegend variant="label">Projects</FieldLegend>
            <FieldDescription>{needsField ? 'Pick the project that has the field.' : 'None selected means every project you can open.'}</FieldDescription>
            <div className="flex max-h-44 flex-col gap-1 overflow-y-auto rounded-xl border p-1.5">
              {(projects ?? [])
                .filter((p) => !p.archived_at)
                .map((p) => (
                  <Label key={p.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 font-normal hover:bg-muted">
                    <Checkbox checked={w.projectIds.includes(p.id)} onCheckedChange={(checked) => set({ projectIds: checked ? [...w.projectIds, p.id] : w.projectIds.filter((x) => x !== p.id) })} />
                    <span className="size-2 rounded-full" style={{ background: `var(--c-${p.color})` }} /> {p.name}
                  </Label>
                ))}
            </div>
          </FieldSet>
        )}
        {needsField && (
          <FormField label="Field">
            <NativeSelect value={w.fieldId ?? ''} onChange={(e) => set({ fieldId: e.target.value || undefined })} required>
              <NativeSelectOption value="">{w.projectIds.length ? (fieldOptions.length ? 'Choose a field…' : 'No suitable fields in these projects') : 'Choose a project first'}</NativeSelectOption>
              {fieldOptions.map((f) => (
                <NativeSelectOption key={f.id} value={f.id}>
                  {f.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </FormField>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {CHARTABLE.includes(w.type) && (
            <FormField label="Chart">
              <NativeSelect value={w.chart ?? (w.type === 'status' || w.type === 'field' ? 'donut' : 'bar')} onChange={(e) => set({ chart: e.target.value as 'bar' | 'donut' })}>
                <NativeSelectOption value="bar">Bars</NativeSelectOption>
                <NativeSelectOption value="donut">Donut</NativeSelectOption>
              </NativeSelect>
            </FormField>
          )}
          {(w.type === 'trend' || w.type === 'time') && (
            <FormField label="Weeks">
              <Input type="number" min={2} max={26} value={w.weeks ?? (w.type === 'trend' ? 8 : 4)} onChange={(e) => set({ weeks: Number(e.target.value) })} />
            </FormField>
          )}
          <FormField label="Width">
            <NativeSelect value={w.size} onChange={(e) => set({ size: e.target.value as 'half' | 'full' })}>
              <NativeSelectOption value="half">Half</NativeSelectOption>
              <NativeSelectOption value="full">Full</NativeSelectOption>
            </NativeSelect>
          </FormField>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">{widget ? 'Save widget' : 'Add widget'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function DashboardSettings({ dash, onClose, onSaved }: { dash: Dashboard; onClose: () => void; onSaved: (d: Dashboard) => void }) {
  const act = useAction();
  const [name, setName] = useState(dash.name);
  const [description, setDescription] = useState(dash.description);
  const [visibility, setVisibility] = useState(dash.visibility);
  return (
    <Modal open onClose={onClose} title="Dashboard settings">
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const d = await act(() => api.patch<Dashboard>(`/dashboards/${dash.id}`, { name, description, visibility }), 'Saved');
          if (d) onSaved(d);
        }}
      >
        <FormField label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
        </FormField>
        <FormField label="Description">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
        </FormField>
        <FormField label="Who can open it">
          <NativeSelect value={visibility} onChange={(e) => setVisibility(e.target.value as 'workspace' | 'private')}>
            <NativeSelectOption value="workspace">Everyone in the workspace (each sees their own data)</NativeSelectOption>
            <NativeSelectOption value="private">Only me</NativeSelectOption>
          </NativeSelect>
        </FormField>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!name.trim()} type="submit">
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
