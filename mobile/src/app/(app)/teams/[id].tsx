import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { api, qs, type Message, type Task } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { useApi, useRealtime, useReloadOnFocus } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { useShell } from '@/lib/shell';
import { swatch, useTheme } from '@/lib/theme';
import { channelIcon } from '@/ui/chat';
import { NewTaskForm } from '@/ui/create';
import { FileRow, useFileAdding, type FileSummary } from '@/ui/files';
import { Icon } from '@/ui/Icon';
import { Avatar, AvatarStack, Button, Card, Empty, ErrorState, Field, Input, ListRow, Loading, Muted, Pill, Row, Screen, Select, Sheet, T, Tabs, useAction } from '@/ui/kit';
import { Markdown } from '@/ui/Markdown';
import { TeamCheckins } from '@/ui/teamCheckins';
import { TaskRow } from '@/ui/work';

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
const SECTIONS: Section[] = ['inbox', 'tasks', 'checkins', 'channels', 'files', 'members'];

/** A team's home: its shared inbox, the work given to it, check-ins, channels, files and who's on it. */
export default function TeamView() {
  const { id, tab, checkin } = useLocalSearchParams<{ id: string; tab?: string; checkin?: string }>();
  const [section, setSection] = useState<Section>(SECTIONS.includes(tab as Section) ? (tab as Section) : 'inbox');
  const { data: team, error, refresh, refreshing } = useApi<TeamDetail>(`/teams/${id}`);
  const inbox = useApi<TeamInbox>(`/teams/${id}/inbox`);
  useReloadOnFocus(inbox.reload);
  useRealtime((e) => (e.type === 'task.updated' || e.type === 'message.created' || e.type === 'reconnected') && inbox.reload());

  if (error && !team) return <ErrorState error={error} />;
  if (!team) return <Loading />;
  const open = inbox.data?.tasks ?? [];
  const waiting = open.filter((t) => !t.owner);

  return (
    <>
      <Stack.Screen options={{ title: team.name }} />
      <Screen
        refreshing={refreshing || inbox.refreshing}
        onRefresh={() => {
          refresh();
          inbox.refresh();
        }}
      >
        <Row gap={10} style={{ alignItems: 'flex-start' }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Muted size={12}>Team</Muted>
            {!!team.description && <T tone="ink2">{team.description}</T>}
          </View>
          <AvatarStack users={team.members} max={4} total={team.members.length} />
        </Row>
        {team.can_manage && <Button small icon="edit" title="Edit team" onPress={() => router.push('/admin?tab=teams')} />}
        <Tabs
          value={section}
          onChange={setSection}
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
        {section === 'checkins' && <TeamCheckins team={team} startWriting={checkin === '1'} />}
        {section === 'channels' && <TeamChannels team={team} />}
        {section === 'files' && <TeamFiles team={team} />}
        {section === 'members' && (
          <Card padded={false} style={{ paddingHorizontal: 14 }}>
            {team.members.map((m) => (
              <ListRow key={m.id} left={<Avatar user={m} size="sm" presence />} title={m.name} subtitle={m.title || undefined} chevron onPress={() => router.push(`/people/${m.id}`)} />
            ))}
          </Card>
        )}
      </Screen>
    </>
  );
}

/** A heading over one part of the team inbox. */
function Heading({ title, count, children }: { title: string; count?: number; children?: React.ReactNode }) {
  return (
    <Row gap={8} wrap>
      <T size={16} weight="display">
        {title}
      </T>
      {!!count && <Pill label={String(count)} />}
      <View style={{ flex: 1 }} />
      {children}
    </Row>
  );
}

function TeamInboxSection({ team, inbox, reload }: { team: TeamDetail; inbox: TeamInbox | undefined; reload: () => void }) {
  const { c } = useTheme();
  const { me } = useSession();
  const { openTask } = useShell();
  const act = useAction();
  if (!inbox) return <Loading inline />;
  const waiting = inbox.tasks.filter((t) => !t.owner);
  const take = async (t: Task) => {
    if (await act(() => api.patch(`/tasks/${t.id}`, { ownerId: me!.user.id }), `“${t.title}” is yours`)) reload();
  };
  return (
    <View style={{ gap: 20 }}>
      <View style={{ gap: 8 }}>
        <Heading title="Waiting for someone" count={waiting.length} />
        {!waiting.length ? (
          <Muted>Nothing given to {team.name} is waiting. Tasks given to the team show here until someone takes them.</Muted>
        ) : (
          <Card padded={false} style={{ paddingHorizontal: 14 }}>
            {waiting.map((t, i) => (
              <View key={t.id} style={[{ gap: 4, paddingBottom: team.is_member ? 10 : 0 }, i > 0 && { borderTopWidth: 1, borderColor: c.line2 }]}>
                <TaskRow task={t} onOpen={() => openTask(t.id)} />
                {team.is_member && <Button small title="Take it" onPress={() => take(t)} />}
              </View>
            ))}
          </Card>
        )}
      </View>

      <View style={{ gap: 8 }}>
        <Heading title={`Mentions of @${team.name}`} count={inbox.mentions.length} />
        {!inbox.mentions.length && <Muted>When someone writes @{team.name} in a chat or channel, it shows here — for the last 30 days.</Muted>}
        {inbox.mentions.map((m) => (
          <Pressable
            key={m.id}
            onPress={() => router.push(`/channels/${m.channel_id}?message=${m.parent_id ?? m.id}`)}
            accessibilityRole="button"
            style={({ pressed }) => ({ flexDirection: 'row', gap: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: c.line, backgroundColor: pressed ? c.hover : c.surface })}
          >
            <Avatar user={m.user} size="sm" />
            <View style={{ flex: 1, gap: 2 }}>
              <Row gap={6} wrap>
                <T size={14} weight="bold">
                  {m.user?.name}
                </T>
                <Muted size={12}>
                  in {m.channel?.kind === 'dm' ? 'a direct message' : `#${m.channel?.name}`} · {timeAgo(m.created_at)}
                </Muted>
              </Row>
              <Markdown text={m.body} compact size={14} />
            </View>
          </Pressable>
        ))}
      </View>

      <View style={{ gap: 8 }}>
        <Heading title="New files" count={inbox.files.length} />
        {!inbox.files.length && <Muted>Files shared with the team, or in its channels, show here.</Muted>}
        {inbox.files.slice(0, 5).map((f) => (
          <ListRow key={f.id} left={<Icon name="file" size={17} color={c.muted} />} title={f.name} subtitle={`${f.owner_name} · ${timeAgo(f.created_at)}`} onPress={() => router.push(`/files/${f.id}`)} />
        ))}
      </View>
    </View>
  );
}

function TeamTasks({ team, tasks, reload }: { team: TeamDetail; tasks: Task[] | undefined; reload: () => void }) {
  const { c } = useTheme();
  const { openTask } = useShell();
  const act = useAction();
  const [adding, setAdding] = useState(false);
  const toggle = async (t: Task, done: boolean) => {
    if (await act(() => api.patch(`/tasks/${t.id}`, { status: done ? 'done' : 'todo' }))) reload();
  };
  return (
    <View style={{ gap: 10 }}>
      <Heading title="Open tasks for the team">
        <Button small variant="primary" icon="plus" title="Give the team a task" onPress={() => setAdding(true)} />
      </Heading>
      {!tasks ? (
        <Loading inline />
      ) : !tasks.length ? (
        <Empty icon="task" title="No open team tasks">
          Give a task to {team.name} and everyone on it is told; whoever is free can take it.
        </Empty>
      ) : (
        <Card padded={false} style={{ paddingHorizontal: 14 }}>
          {tasks.map((t, i) => (
            <View key={t.id} style={i ? { borderTopWidth: 1, borderColor: c.line2 } : undefined}>
              <TaskRow task={t} onOpen={() => openTask(t.id)} onToggle={(d) => toggle(t, d)} />
            </View>
          ))}
        </Card>
      )}
      <Sheet open={adding} onClose={() => setAdding(false)} title={`New task for ${team.name}`} full>
        <NewTaskForm
          defaults={{ teamId: team.id }}
          onDone={(task) => {
            setAdding(false);
            if (task) reload();
          }}
        />
      </Sheet>
    </View>
  );
}

function TeamChannels({ team }: { team: TeamDetail }) {
  const { c } = useTheme();
  const { reloadChannels } = useShell();
  const act = useAction();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', kind: 'private' });
  return (
    <View style={{ gap: 10 }}>
      <Heading title="Team channels">{team.is_member && <Button small variant="primary" icon="plus" title="New team channel" onPress={() => setCreating(true)} />}</Heading>
      {!team.channels.length ? (
        <Empty icon="hash" title="No team channels yet">
          A team channel has everyone on {team.name} in it — including people who join the team later.
        </Empty>
      ) : (
        <Card padded={false} style={{ paddingHorizontal: 14 }}>
          {team.channels.map((ch) => (
            <ListRow key={ch.id} left={<Icon name={channelIcon(ch)} size={17} color={c.muted} />} title={ch.name} subtitle={ch.topic || undefined} chevron onPress={() => router.push(`/channels/${ch.id}`)} />
          ))}
        </Card>
      )}
      {team.projects.length > 0 && (
        <View style={{ gap: 8 }}>
          <Heading title="Team projects" />
          <Row gap={8} wrap>
            {team.projects.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => router.push(`/projects/${p.id}`)}
                accessibilityRole="button"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 34, borderRadius: 17, borderWidth: 1, borderColor: c.lineStrong, backgroundColor: c.surface }}
              >
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: swatch(p.color) }} />
                <T size={13} weight="semibold">
                  {p.name}
                </T>
              </Pressable>
            ))}
          </Row>
        </View>
      )}
      <Sheet
        open={creating}
        onClose={() => setCreating(false)}
        title={`New channel for ${team.name}`}
        footer={
          <Button
            title="Create channel"
            variant="primary"
            full
            disabled={!form.name.trim()}
            onPress={async () => {
              const channel = await act(() => api.post<{ id: string }>('/channels', { name: form.name, kind: form.kind, teamId: team.id }), 'Channel created');
              if (channel) {
                setCreating(false);
                reloadChannels();
                router.push(`/channels/${channel.id}`);
              }
            }}
          />
        }
      >
        <Field label="Name" hint="Lowercase, no spaces — e.g. design-crit.">
          <Input
            autoFocus
            autoCapitalize="none"
            value={form.name}
            onChangeText={(v) => setForm({ ...form, name: v.toLowerCase().replace(/\s+/g, '-') })}
            placeholder={`${team.name.toLowerCase().replace(/\s+/g, '-')}-chat`}
          />
        </Field>
        <Field label="Who can find it">
          <Select
            title="Who can find it"
            value={form.kind}
            onChange={(kind) => setForm({ ...form, kind })}
            options={[
              { id: 'private', label: 'Only the team (private)' },
              { id: 'public', label: 'Anyone in the workspace can join' },
            ]}
          />
        </Field>
      </Sheet>
    </View>
  );
}

function TeamFiles({ team }: { team: TeamDetail }) {
  const { data, reload } = useApi<FileSummary[]>(`/files${qs({ teamId: team.id })}`);
  const adding = useFileAdding(reload, { teamId: team.id });
  return (
    <View style={{ gap: 10 }}>
      <Heading title="Team files">{team.is_member && <Button small variant="primary" icon="upload" title="Share a file" onPress={adding.upload} />}</Heading>
      {!data ? (
        <Loading inline />
      ) : !data.length ? (
        <Empty icon="files" title="No team files yet">
          Files shared with {team.name}, or in its channels, are kept here for everyone on the team.
        </Empty>
      ) : (
        <Card padded={false} style={{ paddingHorizontal: 14 }}>
          {data.map((f) => (
            <FileRow key={f.id} f={f} />
          ))}
        </Card>
      )}
      {adding.sheets}
    </View>
  );
}
