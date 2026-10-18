import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MeetingRecordings } from '../components/Recorder';
import { api, qs, type Decision, type Meeting, type Task } from '../api';
import { AiDraft, useAiEnabled } from '../components/Ai';
import { Avatar, AvatarStack } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { useShell } from '../components/Layout';
import { Markdown } from '../components/Markdown';
import { NewTaskForm } from '../components/QuickCreate';
import { TaskRow } from '../components/TaskDrawer';
import { EmptyState, ErrorState, FormField, Loading, LoadingRows, Modal, Page, PageHeader, Panel, PeoplePicker, Pill, SecretReveal, TabBar, useAction, useConfirm } from '@/components/kit';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { dateTime, localTimeIn, timeOf } from '../format';
import { useApi, useRealtime } from '../hooks';
import { useSession } from '../session';
import { Button, buttonVariants } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';

/** Private calendar subscription link for Google Calendar, Outlook or Apple Calendar. */
function CalendarSubscribe({ open, onClose }: { open: boolean; onClose: () => void }) {
  const act = useAction();
  const { data, reload } = useApi<{ enabled: boolean; created_at: string | null; last_used_at: string | null }>(open ? '/me/calendar-feed' : null);
  const [link, setLink] = useState<{ url: string; webcal: string } | null>(null);
  const create = async () => {
    const res = await act(() => api.post<{ url: string; webcal: string }>('/me/calendar-feed'));
    if (res) {
      setLink(res);
      reload();
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Add Küü meetings to your calendar">
      <p className="mb-4 text-sm text-muted-foreground">
        Subscribe once and your Küü meetings (the ones you organise or were invited to) show up in Google Calendar, Outlook or Apple Calendar. Calendar apps
        refresh subscriptions every few hours, so a change can take a while to appear.
      </p>
      {link ? (
        <SecretReveal
          title="Copy this private link now. It won’t be shown again."
          value={link.url}
          actions={
            <a href={link.webcal} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              Open in calendar app
            </a>
          }
        >
          <span className="text-xs">
            Google Calendar: <em>Other calendars → + → From URL</em>. Outlook: <em>Add calendar → Subscribe from web</em>. Anyone with the link can see your meeting titles and
            times, so keep it private.
          </span>
        </SecretReveal>
      ) : data?.enabled ? (
        <>
          <p className="text-sm">
            You have a calendar link{data.last_used_at ? `, last read by your calendar ${new Date(data.last_used_at).toLocaleString()}` : ''}. Links are only
            shown when created; make a new one if you’ve lost it (the old link stops working).
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={async () => {
                await act(() => api.del('/me/calendar-feed'), 'Calendar link turned off');
                reload();
              }}>
              Turn off
            </Button>
            <Button onClick={create}>
              Make a new link
            </Button>
          </div>
        </>
      ) : (
        data && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button onClick={create}>
              Create my calendar link
            </Button>
          </div>
        )
      )}
    </Modal>
  );
}

export function Meetings() {
  const { openCreate } = useShell();
  const [range, setRange] = useState<'upcoming' | 'past'>('upcoming');
  const [subscribe, setSubscribe] = useState(false);
  const { data, error, reload } = useApi<Meeting[]>(`/meetings${qs({ range })}`);
  useRealtime((e) => e.type === 'meeting.updated' && reload());
  const groups = new Map<string, Meeting[]>();
  for (const m of data ?? []) {
    const key = new Date(m.starts_at).toDateString();
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  return (
    <Page width="narrow">
      <PageHeader
        title="Meetings"
        description="Agendas, notes, decisions and follow-ups — connected to the work they concern."
        actions={
          <>
            <Button variant="outline" onClick={() => setSubscribe(true)}>
              <Icon name="calendar" data-icon="inline-start" /> Add to my calendar
            </Button>
            <Button onClick={() => openCreate('meeting')}>
              <Icon name="plus" data-icon="inline-start" /> Schedule
            </Button>
          </>
        }
      />
      <CalendarSubscribe open={subscribe} onClose={() => setSubscribe(false)} />
      <TabBar value={range} onChange={setRange} tabs={[{ id: 'upcoming', label: 'Upcoming' }, { id: 'past', label: 'Past' }]} />
      {error && <ErrorState error={error} retry={reload} />}
      {!data && !error && <LoadingRows rows={4} />}
      {data && !data.length && (
        <EmptyState
          icon="video"
          title={range === 'upcoming' ? 'No upcoming meetings' : 'No past meetings'}
          action={
            range === 'upcoming' && (
              <Button onClick={() => openCreate('meeting')}>
                <Icon name="plus" data-icon="inline-start" /> Schedule a meeting
              </Button>
            )
          }
        >
          Schedule from here, a channel or a project.
        </EmptyState>
      )}
      {[...groups.entries()].map(([day, list]) => (
        <section key={day} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">{new Date(day).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
          <Card className="gap-0 p-1.5">
            {list.map((m) => {
              const live = !!m.started_at && !m.ended_at;
              return (
                <Link key={m.id} to={`/meetings/${m.id}`} className="flex items-stretch gap-3 rounded-xl p-3 transition-colors hover:bg-muted/60">
                  <div className="flex w-16 shrink-0 flex-col items-end">
                    <strong className="text-sm font-semibold tabular-nums">{timeOf(m.starts_at)}</strong>
                    <span className="text-xs text-muted-foreground">{m.duration_min} min</span>
                  </div>
                  <span className={cn('w-1 shrink-0 rounded-full', live && 'animate-pulse')} style={{ background: live ? 'var(--destructive)' : `var(--c-${m.project?.color ?? 'purple'})` }} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      {m.title} {live && <Pill tone="danger">Live</Pill>}
                    </h3>
                    <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                      {m.video_url && <Icon name="video" size={13} />} {m.project?.name ?? m.location ?? ''} · organised by {m.organizer?.name}
                    </p>
                    <AvatarStack users={m.participants} max={5} />
                  </div>
                </Link>
              );
            })}
          </Card>
        </section>
      ))}
    </Page>
  );
}

interface MeetingFull extends Meeting {
  agenda: string;
  notes: string;
  tasks: Task[];
  decisions: Decision[];
  channel: { id: string; name: string; kind: string } | null;
  my_response: string | null;
  can_manage: boolean;
  can_take_notes: boolean;
}

export function MeetingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { openTask } = useShell();
  const { people } = useSession();
  const act = useAction();
  const confirm = useConfirm();
  const { data: m, error, reload } = useApi<MeetingFull>(`/meetings/${id}`);
  const [notes, setNotes] = useState<string | null>(null);
  const [agenda, setAgenda] = useState<string | null>(null);
  const [addingTask, setAddingTask] = useState(false);
  const [decision, setDecision] = useState('');
  const [editPeople, setEditPeople] = useState<string[] | null>(null);
  const aiEnabled = useAiEnabled();
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  useRealtime((e) => e.type === 'meeting.updated' && e.meetingId === id && notes === null && agenda === null && reload());

  if (error) return <ErrorState error={error} retry={reload} />;
  if (!m) return <Loading />;
  const live = !!m.started_at && !m.ended_at;
  const zones = [...new Set(m.participants.map((p) => p.timezone).filter((tz) => tz && tz !== Intl.DateTimeFormat().resolvedOptions().timeZone))];

  const saveNotes = async () => {
    if (notes === null || notes === m.notes) return setNotes(null);
    await act(() => api.patch(`/meetings/${m.id}`, { notes }), 'Notes saved');
    setNotes(null);
    reload();
  };
  const saveAgenda = async () => {
    if (agenda === null || agenda === m.agenda) return setAgenda(null);
    await act(() => api.patch(`/meetings/${m.id}`, { agenda }), 'Agenda saved');
    setAgenda(null);
    reload();
  };

  const status = live ? 'Happening now' : m.ended_at ? 'Ended' : 'Scheduled';
  return (
    <Page>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to="/meetings" />}>Meetings</BreadcrumbLink>
          </BreadcrumbItem>
          {m.project && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link to={`/projects/${m.project.id}`} />}>{m.project.name}</BreadcrumbLink>
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>
      <Card>
        <CardContent className="flex flex-wrap items-start gap-4">
          <div className="flex min-w-0 flex-1 basis-72 flex-col gap-1">
            <p className={cn('text-xs font-semibold tracking-wide uppercase', live ? 'text-destructive' : 'text-muted-foreground')}>{status}</p>
            <h1 className="font-heading text-2xl font-semibold tracking-tight">{m.title}</h1>
            <p className="text-sm text-muted-foreground">
              {dateTime(m.starts_at)} – {timeOf(m.ends_at)} · {m.duration_min} min{m.location && ` · ${m.location}`}
            </p>
            {zones.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {zones.map((tz) => `${new Date(m.starts_at).toLocaleTimeString(undefined, { timeZone: tz, hour: 'numeric', minute: '2-digit' })} ${tz}`).join(' · ')}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {m.video_url && !m.ended_at && (
              <a
                href={m.video_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => m.can_take_notes && !m.started_at && api.post(`/meetings/${m.id}/start`).then(reload)}
                className={buttonVariants()}
              >
                <Icon name="video" data-icon="inline-start" /> {live ? 'Join now' : 'Start & join video'}
              </a>
            )}
            {m.can_take_notes && !m.ended_at && (
              <Button
                variant="outline"
                onClick={async () => {
                  if (!(await confirm({ title: 'End the meeting?', description: 'Notes, decisions and follow-ups are sent to participants.', confirmLabel: 'End & share' }))) return;
                  await act(() => api.post(`/meetings/${m.id}/end`), 'Meeting wrapped up');
                  reload();
                }}
              >
                <Icon name="check" data-icon="inline-start" /> End & share follow-ups
              </Button>
            )}
            <a href={`/api/meetings/${m.id}/ics`} className={buttonVariants({ variant: 'outline' })}>
              <Icon name="calendar" data-icon="inline-start" />
              Add to calendar
            </a>
            {m.my_response && !m.ended_at && (
              <NativeSelect
                value={m.my_response}
                onChange={async (e) => {
                  await act(() => api.post(`/meetings/${m.id}/respond`, { response: e.target.value }), 'Response saved');
                  reload();
                }}
                aria-label="Your response"
              >
                <NativeSelectOption value="pending">Not responded</NativeSelectOption>
                <NativeSelectOption value="accepted">Going</NativeSelectOption>
                <NativeSelectOption value="declined">Not going</NativeSelectOption>
              </NativeSelect>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <MeetingRecordings meetingId={m.id} meetingTitle={m.title} />
          <Panel
            title="Agenda"
            action={
              m.can_take_notes &&
              agenda === null && (
                <Button variant="ghost" size="sm" onClick={() => setAgenda(m.agenda)}>
                  <Icon name="edit" data-icon="inline-start" /> Edit
                </Button>
              )
            }
            contentClassName="flex flex-col gap-2"
          >
            {agenda !== null ? (
              <>
                <Textarea rows={6} value={agenda} onChange={(e) => setAgenda(e.target.value)} autoFocus aria-label="Agenda" />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setAgenda(null)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={saveAgenda}>
                    Save
                  </Button>
                </div>
              </>
            ) : m.agenda ? (
              <Markdown text={m.agenda} />
            ) : (
              <p className="text-sm text-muted-foreground">No agenda yet.</p>
            )}
          </Panel>

          <Panel
            title="Notes"
            action={
              <div className="flex flex-wrap items-center gap-1">
                {aiEnabled && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={aiBusy}
                    onClick={async () => {
                      setAiBusy(true);
                      const res = await act(() => api.post<{ summary: string }>(`/ai/meetings/${m.id}/summary`));
                      setAiBusy(false);
                      if (res) setAiSummary(res.summary);
                    }}
                  >
                    {aiBusy ? <Spinner data-icon="inline-start" /> : <Icon name="spark" data-icon="inline-start" />} {aiBusy ? 'Drafting…' : 'Draft summary'}
                  </Button>
                )}
                {m.can_take_notes && notes === null && (
                  <Button variant="ghost" size="sm" onClick={() => setNotes(m.notes)}>
                    <Icon name="edit" data-icon="inline-start" /> {m.notes ? 'Edit' : 'Take notes'}
                  </Button>
                )}
              </div>
            }
            contentClassName="flex flex-col gap-3"
          >
            {aiSummary && (
              <AiDraft
                text={aiSummary}
                useLabel="Add to notes"
                onUse={
                  m.can_take_notes
                    ? async () => {
                        await act(() => api.patch(`/meetings/${m.id}`, { notes: `${m.notes ? `${m.notes}\n\n` : ''}## Summary\n\n${aiSummary}` }), 'Summary added to notes');
                        setAiSummary(null);
                        reload();
                      }
                    : undefined
                }
              />
            )}
            {notes !== null ? (
              <>
                <Textarea
                  rows={12}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  autoFocus
                  aria-label="Meeting notes"
                  placeholder="Capture discussion points. Record decisions and follow-ups below so they are tracked."
                />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setNotes(null)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={saveNotes}>
                    Save notes
                  </Button>
                </div>
              </>
            ) : m.notes ? (
              <Markdown text={m.notes} />
            ) : (
              <p className="text-sm text-muted-foreground">No notes yet.</p>
            )}
          </Panel>

          <Panel title="Decisions" contentClassName="flex flex-col gap-2">
            {m.decisions.map((d) => (
              <div key={d.id} className="flex items-start gap-3 py-1">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <Icon name="gavel" size={15} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <strong className="text-sm font-semibold">{d.title}</strong>
                  <span className="text-xs text-muted-foreground">{d.decided_by_name}</span>
                </span>
              </div>
            ))}
            {!m.decisions.length && <p className="text-sm text-muted-foreground">No decisions recorded.</p>}
            {m.can_take_notes && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!decision.trim()) return;
                  await act(() => api.post('/decisions', { title: decision, meetingId: m.id }), 'Decision recorded');
                  setDecision('');
                  reload();
                }}
              >
                <Input value={decision} onChange={(e) => setDecision(e.target.value)} placeholder="Record a decision and press Enter" aria-label="New decision" />
              </form>
            )}
          </Panel>

          <Panel
            title="Follow-up tasks"
            action={
              m.can_take_notes && (
                <Button variant="outline" size="sm" onClick={() => setAddingTask(true)}>
                  <Icon name="plus" data-icon="inline-start" /> Add follow-up
                </Button>
              )
            }
            contentClassName="flex flex-col"
          >
            {m.tasks.map((t) => (
              <TaskRow key={t.id} task={t} onOpen={() => openTask(t.id)} />
            ))}
            {!m.tasks.length && <p className="text-sm text-muted-foreground">No follow-ups yet. Every action item should have one owner and a date.</p>}
          </Panel>
        </div>

        <aside className="flex flex-col gap-4">
          <Panel
            title="Participants"
            description={`${m.participants.length} invited`}
            action={
              m.can_manage &&
              !m.ended_at && (
                <Button variant="ghost" size="sm" onClick={() => setEditPeople(m.participants.map((p) => p.id))}>
                  Edit
                </Button>
              )
            }
            contentClassName="flex flex-col gap-1"
          >
            {m.participants.map((p) => (
              <div key={p.id} className="flex items-center gap-2.5 py-1.5">
                <Avatar user={p} size="sm" showPresence />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex flex-wrap items-center gap-1.5 truncate text-sm">
                    {p.name} {p.id === m.organizer?.id && <Pill>Organizer</Pill>}
                  </span>
                  <span className="text-xs text-muted-foreground">{localTimeIn(p.timezone)} local time</span>
                </span>
                <Pill tone={p.response === 'accepted' ? 'success' : p.response === 'declined' ? 'danger' : 'outline'}>
                  {p.response === 'accepted' ? 'Going' : p.response === 'declined' ? 'Declined' : 'Pending'}
                </Pill>
              </div>
            ))}
          </Panel>
          {m.channel && (
            <Panel title="Discussion">
              <Link to={`/channels/${m.channel.id}`} className={buttonVariants({ variant: 'outline', className: 'w-full justify-start' })}>
                <Icon name="hash" data-icon="inline-start" /> {m.channel.name}
              </Link>
            </Panel>
          )}
          {m.can_manage && !m.ended_at && (
            <Button
              variant="destructive"
              className="w-full"
              onClick={async () => {
                if (!(await confirm({ title: 'Cancel this meeting?', description: 'Participants will be notified.', confirmLabel: 'Cancel meeting', cancelLabel: 'Keep it', destructive: true }))) return;
                await act(() => api.del(`/meetings/${m.id}`), 'Meeting cancelled');
                navigate('/meetings');
              }}
            >
              Cancel meeting
            </Button>
          )}
        </aside>
      </div>

      <Modal open={addingTask} onClose={() => setAddingTask(false)} title="Add a follow-up task">
        {addingTask && (
          <NewTaskForm
            projectId={m.project?.id}
            defaults={{ meetingId: m.id }}
            onDone={() => {
              setAddingTask(false);
              reload();
            }}
          />
        )}
      </Modal>
      <Modal open={editPeople !== null} onClose={() => setEditPeople(null)} title="Participants">
        {editPeople && (
          <form
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              await act(() => api.patch(`/meetings/${m.id}`, { participantIds: editPeople }), 'Participants updated');
              setEditPeople(null);
              reload();
            }}
          >
            <FormField label="People">
              <PeoplePicker people={people} value={editPeople} onChange={setEditPeople} />
            </FormField>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button type="submit">Save</Button>
            </div>
          </form>
        )}
      </Modal>
    </Page>
  );
}
