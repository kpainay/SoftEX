import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Activity, type Decision, type Notification, type Project, type Task } from '../api';
import { Avatar, AvatarStack } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { useShell } from '../components/Layout';
import { TaskRow } from '../components/TaskDrawer';
import { ErrorState, FormField, Loading, Modal, Page, PageHeader, Panel, SwitchField, useAction } from '@/components/kit';
import { ProjectCard } from '../components/ProjectCard';
import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { plainMentions, timeAgo, timeOf } from '../format';
import { useApi, useRealtime } from '../hooks';
import { useSession } from '../session';
import { GroupCount } from './Inbox';
import { Button, buttonVariants } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';

interface HomeData {
  since: string;
  first_visit?: boolean;
  setup?: { id: SetupStepId; done: boolean }[] | null;
  focus: Task[];
  up_next: Task[];
  blocked: Task[];
  meetings: {
    id: string;
    title: string;
    starts_at: string;
    duration_min: number;
    location: string;
    video_url: string;
    started_at: string | null;
    participants: { id: string; name: string; color: string }[];
  }[];
  mentions: (Notification & { actor_name: string; actor_color: string })[];
  decisions: (Decision & { project_name: string | null })[];
  changes: Activity[];
  projects: { id: string; name: string; color: string; health: string; progress: number; members: { id: string; name: string; color: string }[]; member_count: number }[];
  onboarding: { total: number; done: number };
  pending_approvals: number;
  checked_in_today: boolean;
  reviews_due: { id: string; title: string; review_date: string }[];
  counts: { open_tasks: number; overdue: number; unread: number };
}

const OPTIONAL = [
  { id: 'projects', label: 'Active projects' },
  { id: 'decisions', label: 'Recent decisions' },
  { id: 'changes', label: 'What changed' },
  { id: 'upnext', label: 'Up next tasks' },
] as const;
type Section = (typeof OPTIONAL)[number]['id'];

function loadHidden(): Section[] {
  try {
    return JSON.parse(localStorage.getItem('softex.home.hidden') ?? '[]');
  } catch {
    return [];
  }
}

export function Home() {
  const { me } = useSession();
  const { openTask, openCreate } = useShell();
  const act = useAction();
  const { data, error, reload } = useApi<HomeData>('/home');
  const [hidden, setHidden] = useState<Section[]>(loadHidden);
  const [tuning, setTuning] = useState(false);
  const [checkin, setCheckin] = useState(false);

  useRealtime((e) => {
    if (['task.updated', 'notification', 'meeting.updated', 'reconnected'].includes(e.type)) reload();
  });

  // Mark "since you last checked" after the user has seen the page for a moment.
  useEffect(() => {
    const t = window.setTimeout(() => api.post('/home/seen').catch(() => {}), 5000);
    return () => window.clearTimeout(t);
  }, []);

  const toggleSection = (id: Section) => {
    const next = hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id];
    setHidden(next);
    try {
      localStorage.setItem('softex.home.hidden', JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  };

  if (error) return <ErrorState error={error} retry={reload} />;
  if (!data) return <Loading />;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const first = me!.user.name.split(' ')[0];
  const complete = async (t: Task, done: boolean) => {
    await act(() => api.patch(`/tasks/${t.id}`, { status: done ? 'done' : 'todo' }), done ? 'Task marked complete' : 'Task reopened');
    // Waited for, so the ticked box doesn't flick back before the fresh list arrives.
    await reload();
  };
  const show = (id: Section) => !hidden.includes(id);

  const nudge = 'h-7 gap-1.5 rounded-full px-3 text-xs';
  const viewAll = (to: string, label: string) => (
    <Link to={to} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
      {label} <Icon name="arrow" data-icon="inline-end" />
    </Link>
  );

  return (
    <Page width="full" className="max-w-7xl">
      <PageHeader
        eyebrow={new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        title={
          <>
            {greeting}, {first} <span aria-hidden="true">👋</span>
          </>
        }
        description={
          <>
            {data.counts.open_tasks} open task{data.counts.open_tasks === 1 ? '' : 's'}
            {data.counts.overdue ? `, ${data.counts.overdue} overdue` : ''} · {data.meetings.length} meeting{data.meetings.length === 1 ? '' : 's'} coming up ·{' '}
            {data.counts.unread} unread
          </>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setTuning(true)}>
              <Icon name="settings" data-icon="inline-start" /> Customize
            </Button>
            <Button onClick={() => openCreate()}>
              <Icon name="plus" data-icon="inline-start" /> Create new
            </Button>
          </>
        }
      />

      <div className="-mt-2 flex flex-wrap gap-2">
        {data.onboarding.total > 0 && data.onboarding.done < data.onboarding.total && (
          <Badge variant="brand" className={nudge} render={<Link to="/settings?tab=onboarding" />}>
            <Icon name="flag" /> Onboarding: {data.onboarding.done} of {data.onboarding.total} steps done
          </Badge>
        )}
        {data.pending_approvals > 0 && (
          <Badge variant="warning" className={nudge} render={<Link to="/requests" />}>
            <Icon name="inboxCheck" /> {data.pending_approvals} request{data.pending_approvals > 1 ? 's' : ''} waiting for your approval
          </Badge>
        )}
        {!data.checked_in_today && me!.role !== 'guest' && (
          <Badge variant="brand" className={cn(nudge, 'cursor-pointer')} render={<button type="button" onClick={() => setCheckin(true)} />}>
            <Icon name="target" /> Share today’s check-in
          </Badge>
        )}
        {data.reviews_due.map((p) => (
          <Badge key={p.id} variant="warning" className={nudge} render={<Link to={`/knowledge/${p.id}`} />}>
            <Icon name="book" /> “{p.title}” is due for review
          </Badge>
        ))}
      </div>

      {data.setup && <SetupGuide steps={data.setup} />}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel
            title="Today’s focus"
            description={data.focus.length ? `${data.focus.length} task${data.focus.length > 1 ? 's' : ''} need your attention` : 'Nothing due today. Nice.'}
            action={viewAll('/my-work', 'View all')}
            contentClassName="flex flex-col"
          >
            {data.focus.map((t) => (
              <TaskRow key={t.id} task={t} onOpen={() => openTask(t.id)} onToggle={(d) => complete(t, d)} />
            ))}
            <Button variant="ghost" className="mt-1 justify-start text-muted-foreground" onClick={() => openCreate('task')}>
              <Icon name="plus" data-icon="inline-start" /> Add a task
            </Button>
          </Panel>

          {data.blocked.length > 0 && (
            <Panel
              className="ring-warning/40"
              title={
                <span className="flex items-center gap-2">
                  <Icon name="alert" size={18} className="text-warning" /> Blocked
                </span>
              }
              description="Work that cannot move until something changes"
              contentClassName="flex flex-col"
            >
              {data.blocked.map((t) => (
                <TaskRow key={t.id} task={t} onOpen={() => openTask(t.id)} />
              ))}
            </Panel>
          )}

          {show('upnext') && data.up_next.length > 0 && (
            <Panel title="Up next" description="Your next open tasks" contentClassName="flex flex-col">
              {data.up_next.map((t) => (
                <TaskRow key={t.id} task={t} onOpen={() => openTask(t.id)} onToggle={(d) => complete(t, d)} />
              ))}
            </Panel>
          )}

          {show('projects') && (
            <Panel title="Active projects" description="Projects you are part of" action={viewAll('/projects', 'All projects')}>
              {data.projects.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {data.projects.map((p) => (
                    <ProjectCard key={p.id} project={p} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  You are not in any projects yet.{' '}
                  {me!.role !== 'guest' && (
                    <Button variant="link" size="inline" onClick={() => openCreate('project')}>
                      Start one
                    </Button>
                  )}
                </p>
              )}
            </Panel>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <Panel title="Meetings" description="Next 36 hours" contentClassName="flex flex-col gap-1" footer={viewAll('/meetings', 'Open meetings')}>
            {data.meetings.map((m) => (
              <Link key={m.id} to={`/meetings/${m.id}`} className="-mx-2 flex items-stretch gap-3 rounded-xl p-2 transition-colors hover:bg-muted/60">
                <div className="flex w-12 shrink-0 flex-col items-end">
                  <strong className="text-sm font-semibold tabular-nums">{timeOf(m.starts_at).replace(/\s?[AP]M/i, '')}</strong>
                  <span className="text-xs text-muted-foreground">{timeOf(m.starts_at).match(/[AP]M/i)?.[0] ?? ''}</span>
                </div>
                <span className={cn('w-1 shrink-0 rounded-full bg-primary', m.started_at && 'animate-pulse bg-destructive')} />
                <div className="flex min-w-0 flex-col gap-1">
                  <h3 className="truncate text-sm font-semibold">{m.title}</h3>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Icon name={m.video_url ? 'video' : 'calendar'} size={13} />
                    {m.started_at ? 'Live now' : new Date(m.starts_at).toDateString() === new Date().toDateString() ? 'Today' : 'Tomorrow'} · {m.duration_min} min
                  </p>
                  <AvatarStack users={m.participants} />
                </div>
              </Link>
            ))}
            {!data.meetings.length && <p className="text-sm text-muted-foreground">No meetings coming up.</p>}
          </Panel>

          <Panel title="Mentions & messages" description="Unread" contentClassName="flex flex-col gap-1">
            {data.mentions.map((n) => (
              <Link key={n.id} to={n.link} className="-mx-2 flex gap-2.5 rounded-xl p-2 transition-colors hover:bg-muted/60" onClick={() => api.post(`/notifications/${n.id}/read`)}>
                <Avatar user={{ name: n.actor_name ?? '?', color: n.actor_color }} size="sm" />
                <div className="flex min-w-0 flex-col gap-0.5 text-sm">
                  <p>
                    {n.title}
                    <GroupCount n={n} />
                  </p>
                  {n.body && <span className="line-clamp-2 text-xs text-muted-foreground">“{plainMentions(n.body).slice(0, 90)}”</span>}
                  <time className="text-xs text-muted-foreground">{timeAgo(n.created_at)}</time>
                </div>
              </Link>
            ))}
            {!data.mentions.length && <p className="text-sm text-muted-foreground">You are all caught up.</p>}
          </Panel>

          {show('decisions') && (
            <Panel title="Recent decisions" description="Across your projects" action={viewAll('/decisions', 'All')} contentClassName="flex flex-col gap-3">
              {data.decisions.map((d) => (
                <div key={d.id} className="flex gap-2.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <Icon name="gavel" size={15} />
                  </span>
                  <div className="flex min-w-0 flex-col gap-0.5 text-sm">
                    <strong className="font-semibold">{d.title}</strong>
                    <span className="text-xs text-muted-foreground">
                      {d.decided_by_name} · {d.project_name ?? 'Workspace'} · {timeAgo(d.created_at)}
                    </span>
                  </div>
                </div>
              ))}
              {!data.decisions.length && <p className="text-sm text-muted-foreground">No decisions recorded yet.</p>}
            </Panel>
          )}

          {show('changes') && (
            <Panel
              title="What changed"
              description={data.first_visit ? 'Recent activity in your workspace' : `Since you last checked · ${timeAgo(data.since)}`}
              contentClassName="flex flex-col gap-1"
            >
              {data.changes.map((a) => (
                <Link key={a.id} to={a.link || '#'} className="-mx-2 flex gap-2.5 rounded-xl p-2 transition-colors hover:bg-muted/60">
                  <Avatar user={{ id: a.actor_id, name: a.actor_name, color: a.actor_color }} size="sm" />
                  <div className="flex min-w-0 flex-col gap-0.5 text-sm">
                    <p>
                      <strong className="font-semibold">{a.actor_name.split(' ')[0]}</strong> {a.summary}
                    </p>
                    <time className="text-xs text-muted-foreground">{timeAgo(a.created_at)}</time>
                  </div>
                </Link>
              ))}
              {!data.changes.length && <p className="text-sm text-muted-foreground">Nothing new since your last visit.</p>}
            </Panel>
          )}
        </aside>
      </div>

      <Modal open={tuning} onClose={() => setTuning(false)} title="Customize Home" eyebrow="Your view" description="Choose what Home shows. Today’s focus, blocked work, meetings and unread mentions always stay visible.">
        <div className="flex flex-col gap-4 py-1">
          {OPTIONAL.map((o) => (
            <SwitchField key={o.id} label={o.label} checked={!hidden.includes(o.id)} onCheckedChange={() => toggleSection(o.id)} />
          ))}
        </div>
      </Modal>
      <CheckinModal open={checkin} onClose={() => setCheckin(false)} onDone={reload} />
    </Page>
  );
}

export function CheckinModal({ open, onClose, onDone, projectId }: { open: boolean; onClose: () => void; onDone: () => void; projectId?: string }) {
  const act = useAction();
  const { data: projects } = useApi<Project[]>(open && !projectId ? '/projects' : null);
  const [form, setForm] = useState({ projectId: projectId ?? '', done: '', next: '', blockers: '' });
  return (
    <Modal open={open} onClose={onClose} title="Daily check-in" eyebrow="Async update">
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await act(() => api.post('/checkins', { ...form, projectId: form.projectId || null }), 'Check-in shared');
          if (ok) {
            setForm({ projectId: projectId ?? '', done: '', next: '', blockers: '' });
            onClose();
            onDone();
          }
        }}
      >
        {!projectId && (
          <FormField label="Project">
            <NativeSelect value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
              <NativeSelectOption value="">General</NativeSelectOption>
              {(projects ?? []).map((p) => (
                <NativeSelectOption key={p.id} value={p.id}>
                  {p.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </FormField>
        )}
        <FormField label="What did you get done?">
          <Textarea rows={2} value={form.done} onChange={(e) => setForm({ ...form, done: e.target.value })} />
        </FormField>
        <FormField label="What are you working on next?">
          <Textarea rows={2} value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} />
        </FormField>
        <FormField label="Anything blocking you?" hint="Blockers notify the project owner.">
          <Textarea rows={2} value={form.blockers} onChange={(e) => setForm({ ...form, blockers: e.target.value })} />
        </FormField>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!form.done && !form.next && !form.blockers} type="submit">
            Share check-in
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ======================= Getting started =======================

type SetupStepId = 'verify' | 'invite' | 'project' | 'message' | 'page' | 'meeting';

const SETUP_STEPS: Record<SetupStepId, { title: string; text: string; cta: string; to?: string; create?: 'project' | 'page' | 'meeting' }> = {
  verify: { title: 'Confirm your email address', text: 'Use the link we emailed you, so you can invite people and choose a plan.', cta: 'Resend link' },
  invite: { title: 'Invite your team', text: 'Küü is better together. Add colleagues by email, or invite partners as guests.', cta: 'Invite people', to: '/admin?tab=invitations' },
  project: { title: 'Create your first project', text: 'Give one real piece of work a home: its tasks, chat and documents together.', cta: 'New project', create: 'project' },
  message: { title: 'Say hello in a channel', text: 'Post the first message so your team finds a conversation when they arrive.', cta: 'Open channels', to: '/channels' },
  page: { title: 'Write down how you work', text: 'Start the knowledge base with one page: a policy, a how-to or a welcome note.', cta: 'New page', create: 'page' },
  meeting: { title: 'Schedule a meeting', text: 'Add an agenda and capture decisions and follow-ups as you talk.', cta: 'New meeting', create: 'meeting' },
};

/** A checklist that helps whoever set up the workspace get their team going; it disappears once everything is done. */
function SetupGuide({ steps }: { steps: { id: SetupStepId; done: boolean }[] }) {
  const { me } = useSession();
  const { openCreate } = useShell();
  const act = useAction();
  const key = `kuu:setup-hidden:${me?.workspace.id}`;
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  });
  if (hidden) return null;
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done)?.id;
  const hide = () => {
    try {
      localStorage.setItem(key, '1');
    } catch {
      /* private browsing: hide for this visit only */
    }
    setHidden(true);
  };
  return (
    <Card aria-label="Get started" role="region" className="ring-primary/20">
      <CardHeader>
        <CardTitle className="text-base">Get {me?.workspace.name} ready</CardTitle>
        <CardDescription>
          {done} of {steps.length} done — a few minutes now saves your team a lot of time later.
        </CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" onClick={hide}>
            Hide
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Progress value={(done / steps.length) * 100} aria-label="Setup progress" />
        <ol className="flex flex-col divide-y">
          {steps.map((s) => {
            const step = SETUP_STEPS[s.id];
            const primary = s.id === next;
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <span
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-full border',
                    s.done ? 'border-success bg-success text-white' : primary ? 'border-primary' : 'border-border',
                  )}
                  aria-hidden="true"
                >
                  {s.done ? <Icon name="check" size={14} /> : null}
                </span>
                <div className="flex min-w-0 flex-1 basis-48 flex-col">
                  <strong className={cn('text-sm font-medium', s.done && 'text-muted-foreground line-through')}>{step.title}</strong>
                  {!s.done && <span className="text-xs text-muted-foreground">{step.text}</span>}
                </div>
                {!s.done &&
                  (step.to ? (
                    <Link to={step.to} className={buttonVariants({ variant: primary ? 'default' : 'outline', size: 'sm' })}>
                      {step.cta}
                    </Link>
                  ) : step.create ? (
                    <Button size="sm" variant={primary ? 'default' : 'outline'} onClick={() => openCreate(step.create)}>
                      {step.cta}
                    </Button>
                  ) : (
                    <Button size="sm" variant={primary ? 'default' : 'outline'} onClick={() => act(() => api.post('/me/verify-email/resend'), 'Confirmation email sent')}>
                      {step.cta}
                    </Button>
                  ))}
                <span className="sr-only">{s.done ? 'Done' : 'Not done yet'}</span>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
