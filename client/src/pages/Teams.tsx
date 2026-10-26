import { useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, qs, type Message, type Task } from '../api';
import { Avatar, AvatarStack } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { useShell } from '../components/Layout';
import { Markdown } from '../components/Markdown';
import { NewTaskForm } from '../components/QuickCreate';
import { TaskRow } from '../components/TaskDrawer';
import { TeamCheckins } from '../components/TeamCheckins';
import { EmptyState, ErrorState, FormField, Loading, LoadingRows, Modal, Page, PageHeader, Pill, TabBar, useAction } from '@/components/kit';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { timeAgo } from '../format';
import { useApi, useRealtime } from '../hooks';
import { useSession } from '../session';
import { FileRow, type FileSummary } from './Files';

interface TeamDetail {
  id: string;
  name: string;
  description: string;
  members: { id: string; name: string; color: string; title: string; status: string }[];
  is_member: boolean;
  can_manage: boolean;
  channels: { id: string; name: string; kind: string; topic: string }[];
  projects: { id: string; name: string; color: string }[];
}

interface TeamInbox {
  tasks: Task[];
  mentions: (Message & { channel: { id: string; name: string; kind: string } | null })[];
  files: { id: string; name: string; owner_name: string; created_at: string }[];
}

type Section = 'inbox' | 'tasks' | 'checkins' | 'channels' | 'files' | 'members';

/** A team's home: its shared inbox, the work given to it, its channels and files, and who's on it. */
export function TeamView() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const section = (params.get('tab') as Section) ?? 'inbox';
  const { data: team, error } = useApi<TeamDetail>(`/teams/${id}`);
  const inbox = useApi<TeamInbox>(`/teams/${id}/inbox`);
  useRealtime((e) => (e.type === 'task.updated' || e.type === 'message.created' || e.type === 'reconnected') && inbox.reload());

  if (error) return <ErrorState error={error} />;
  if (!team) return <Loading />;
  const open = inbox.data?.tasks ?? [];
  const waiting = open.filter((t) => !t.owner);
  return (
    <Page>
      <PageHeader
        eyebrow="Team"
        title={team.name}
        description={team.description || undefined}
        actions={
          <>
            <AvatarStack users={team.members} max={5} />
            {team.can_manage && (
              <Link to="/admin?tab=teams" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                <Icon name="edit" data-icon="inline-start" /> Edit team
              </Link>
            )}
          </>
        }
      />
      <TabBar
        value={section}
        onChange={(t) => setParams(t === 'inbox' ? {} : { tab: t }, { replace: true })}
        aria-label="Team sections"
        tabs={[
          { id: 'inbox', label: 'Inbox', count: waiting.length + (inbox.data?.mentions.length ?? 0) || undefined },
          { id: 'tasks', label: 'Tasks', count: open.length || undefined },
          { id: 'checkins', label: 'Check-ins' },
          { id: 'channels', label: 'Channels', count: team.channels.length || undefined },
          { id: 'files', label: 'Files' },
          { id: 'members', label: 'Members', count: team.members.length },
        ]}
      />
      {section === 'inbox' && <TeamInboxSection team={team} inbox={inbox.data} reload={inbox.reload} />}
      {section === 'tasks' && <TeamTasks team={team} tasks={inbox.data?.tasks} reload={inbox.reload} />}
      {section === 'checkins' && <TeamCheckins team={team} />}
      {section === 'channels' && <TeamChannels team={team} />}
      {section === 'files' && <TeamFiles team={team} />}
      {section === 'members' && (
        <Card className="py-0">
          <ul className="divide-y" aria-label="Members">
            {team.members.map((m) => (
              <li key={m.id}>
                <Link to={`/people/${m.id}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/60">
                  <Avatar user={m} showPresence />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{m.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{m.title}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Page>
  );
}

/** A heading over one part of the team inbox. */
function Heading({ title, count, children }: { title: string; count?: number; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="font-heading text-base font-semibold">{title}</h2>
      {!!count && <Pill>{count}</Pill>}
      <span className="flex-1" />
      {children}
    </div>
  );
}

function TeamInboxSection({ team, inbox, reload }: { team: TeamDetail; inbox: TeamInbox | undefined; reload: () => void }) {
  const { me } = useSession();
  const { openTask } = useShell();
  const act = useAction();
  if (!inbox) return <LoadingRows />;
  const waiting = inbox.tasks.filter((t) => !t.owner);
  const take = async (t: Task) => {
    if (await act(() => api.patch(`/tasks/${t.id}`, { ownerId: me!.user.id }), `“${t.title}” is yours`)) reload();
  };
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2" aria-label="Waiting for someone">
        <Heading title="Waiting for someone" count={waiting.length} />
        {!waiting.length && <p className="text-sm text-muted-foreground">Nothing given to {team.name} is waiting. Tasks given to the team show here until someone takes them.</p>}
        {waiting.length > 0 && (
          <Card className="gap-0 py-1">
            {waiting.map((t) => (
              <div key={t.id} role="group" aria-label={t.title} className="flex items-center gap-2 pr-2">
                <div className="min-w-0 flex-1">
                  <TaskRow task={t} onOpen={() => openTask(t.id)} />
                </div>
                {team.is_member && (
                  <Button size="sm" variant="outline" onClick={() => take(t)}>
                    Take it
                  </Button>
                )}
              </div>
            ))}
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-2" aria-label="Mentions">
        <Heading title={`Mentions of @${team.name}`} count={inbox.mentions.length} />
        {!inbox.mentions.length && <p className="text-sm text-muted-foreground">When someone writes @{team.name} in a chat or channel, it shows here — for the last 30 days.</p>}
        {inbox.mentions.map((m) => (
          <Link key={m.id} to={`/channels/${m.channel_id}?message=${m.parent_id ?? m.id}`} className="flex gap-3 rounded-xl border bg-card p-3 hover:bg-muted/50">
            <Avatar user={m.user} size="sm" />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex flex-wrap items-center gap-x-2 text-sm">
                <strong className="font-medium">{m.user?.name}</strong>
                <span className="text-xs text-muted-foreground">
                  in {m.channel?.kind === 'dm' ? 'a direct message' : `#${m.channel?.name}`} · {timeAgo(m.created_at)}
                </span>
              </span>
              <span className="line-clamp-3 text-sm">
                <Markdown text={m.body} />
              </span>
            </span>
          </Link>
        ))}
      </section>

      <section className="flex flex-col gap-2" aria-label="New files">
        <Heading title="New files" count={inbox.files.length} />
        {!inbox.files.length && <p className="text-sm text-muted-foreground">Files shared with the team, or in its channels, show here.</p>}
        {inbox.files.slice(0, 5).map((f) => (
          <Link key={f.id} to={`/files/${f.id}`} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-muted">
            <Icon name="file" size={16} className="shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {f.owner_name} · {timeAgo(f.created_at)}
            </span>
          </Link>
        ))}
      </section>
    </div>
  );
}

function TeamTasks({ team, tasks, reload }: { team: TeamDetail; tasks: Task[] | undefined; reload: () => void }) {
  const { openTask } = useShell();
  const act = useAction();
  const [adding, setAdding] = useState(false);
  const toggle = async (t: Task, done: boolean) => {
    if (await act(() => api.patch(`/tasks/${t.id}`, { status: done ? 'done' : 'todo' }))) reload();
  };
  return (
    <div className="flex flex-col gap-3">
      <Heading title="Open tasks for the team">
        <Button size="sm" onClick={() => setAdding(true)}>
          <Icon name="plus" data-icon="inline-start" /> Give the team a task
        </Button>
      </Heading>
      {!tasks && <LoadingRows />}
      {tasks && !tasks.length && (
        <EmptyState icon="task" title="No open team tasks">
          Give a task to {team.name} and everyone on it is told; whoever is free can take it.
        </EmptyState>
      )}
      {!!tasks?.length && (
        <Card className="gap-0 py-1">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} onOpen={() => openTask(t.id)} onToggle={(d) => toggle(t, d)} />
          ))}
        </Card>
      )}
      <Modal open={adding} onClose={() => setAdding(false)} title={`New task for ${team.name}`}>
        <NewTaskForm
          defaults={{ teamId: team.id }}
          onDone={(task) => {
            setAdding(false);
            if (task) reload();
          }}
        />
      </Modal>
    </div>
  );
}

function TeamChannels({ team }: { team: TeamDetail }) {
  const navigate = useNavigate();
  const act = useAction();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', kind: 'private' });
  return (
    <div className="flex flex-col gap-3">
      <Heading title="Team channels">
        {team.is_member && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Icon name="plus" data-icon="inline-start" /> New team channel
          </Button>
        )}
      </Heading>
      {!team.channels.length && (
        <EmptyState icon="hash" title="No team channels yet">
          A team channel has everyone on {team.name} in it — including people who join the team later.
        </EmptyState>
      )}
      {team.channels.length > 0 && (
        <Card className="py-0">
          <ul className="divide-y" aria-label="Team channels">
            {team.channels.map((c) => (
              <li key={c.id}>
                <Link to={`/channels/${c.id}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/60">
                  <Icon name={c.kind === 'private' ? 'lock' : c.kind === 'announcement' ? 'megaphone' : 'hash'} className="shrink-0 text-muted-foreground" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{c.name}</span>
                    {c.topic && <span className="truncate text-xs text-muted-foreground">{c.topic}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {team.projects.length > 0 && (
        <>
          <Heading title="Team projects" />
          <div className="flex flex-wrap gap-2">
            {team.projects.map((p) => (
              <Link key={p.id} to={`/projects/${p.id}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                <span className="size-2 rounded-full" style={{ background: `var(--c-${p.color})` }} /> {p.name}
              </Link>
            ))}
          </div>
        </>
      )}
      <Modal open={creating} onClose={() => setCreating(false)} title={`New channel for ${team.name}`}>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const channel = await act(() => api.post<{ id: string }>('/channels', { name: form.name, kind: form.kind, teamId: team.id }), 'Channel created');
            if (channel) navigate(`/channels/${channel.id}`);
          }}
        >
          <FormField label="Name" hint="Lowercase, no spaces — e.g. design-crit.">
            <Input
              required
              autoFocus
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
              placeholder={`${team.name.toLowerCase().replace(/\s+/g, '-')}-chat`}
            />
          </FormField>
          <FormField label="Who can find it">
            <NativeSelect value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <NativeSelectOption value="private">Only the team (private)</NativeSelectOption>
              <NativeSelectOption value="public">Anyone in the workspace can join</NativeSelectOption>
            </NativeSelect>
          </FormField>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button type="submit">Create channel</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function TeamFiles({ team }: { team: TeamDetail }) {
  const act = useAction();
  const { data, reload } = useApi<FileSummary[]>(`/files${qs({ teamId: team.id })}`);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-3">
      <Heading title="Team files">
        {team.is_member && (
          <>
            <Button size="sm" onClick={() => input.current?.click()}>
              <Icon name="upload" data-icon="inline-start" /> Share a file with the team
            </Button>
            <input
              ref={input}
              type="file"
              hidden
              aria-label="Share a file with the team"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const form = new FormData();
                form.append('file', f);
                form.append('teamId', team.id);
                await act(() => api.upload('/files', form), `Shared with ${team.name}`);
                e.target.value = '';
                reload();
              }}
            />
          </>
        )}
      </Heading>
      {!data && <LoadingRows />}
      {data && !data.length && (
        <EmptyState icon="files" title="No team files yet">
          Files shared with {team.name}, or in its channels, are kept here for everyone on the team.
        </EmptyState>
      )}
      {!!data?.length && (
        <Card className="py-0">
          <ul className="divide-y" aria-label="Team files">
            {data.map((f) => (
              <FileRow key={f.id} f={f} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
