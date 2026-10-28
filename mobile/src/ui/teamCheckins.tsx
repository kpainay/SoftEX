import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { api } from '../lib/api';
import { useApi, useRealtime } from '../lib/hooks';
import { useSession } from '../lib/session';
import { useTheme } from '../lib/theme';
import { CheckinSheet } from './checkin';
import { Icon } from './Icon';
import { Avatar, Button, Card, ChoiceChips, Empty, Field, Loading, Muted, Row, Select, Sheet, T, Toggle, useAction } from './kit';

interface Schedule {
  days: number[];
  time: string;
  enabled: boolean;
}
interface TeamCheckin {
  id: string;
  user_id: string;
  user_name: string;
  user_color: string;
  done: string;
  next: string;
  blockers: string;
  created_at: string;
}
interface CheckinBoard {
  schedule: Schedule | null;
  can_edit: boolean;
  is_member: boolean;
  checkins: TeamCheckin[];
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** Monday first, as most teams think of the week. */
const WEEK = [1, 2, 3, 4, 5, 6, 0];
const pad = (n: number) => String(n).padStart(2, '0');
const timeText = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};
const TIMES = Array.from({ length: 18 * 4 }, (_, i) => `${pad(5 + Math.floor(i / 4))}:${pad((i % 4) * 15)}`);

/** "Weekdays at 9:30 AM", "Mon, Wed and Fri at 9:30 AM" (as on the web). */
export function scheduleLabel(s: Schedule) {
  const days = [...s.days].sort((a, b) => WEEK.indexOf(a) - WEEK.indexOf(b));
  const when =
    days.length === 7
      ? 'Every day'
      : days.join() === '1,2,3,4,5'
        ? 'Weekdays'
        : days.length === 1
          ? `Every ${DAYS[days[0]]}`
          : `${days
              .slice(0, -1)
              .map((d) => DAYS[d])
              .join(', ')} and ${DAYS[days[days.length - 1]]}`;
  return `${when} at ${timeText(s.time)}`;
}

const dayHeading = (iso: string) => {
  const d = new Date(iso);
  if (d.toDateString() === new Date().toDateString()) return 'Today';
  if (d.toDateString() === new Date(Date.now() - 86_400_000).toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
};

/** A team's recurring check-in: when people are asked, and what they said, day by day. */
export function TeamCheckins({ team, startWriting }: { team: { id: string; name: string }; startWriting?: boolean }) {
  const { c } = useTheme();
  const { me } = useSession();
  const { data, reload } = useApi<CheckinBoard>(`/teams/${team.id}/checkins`);
  const [editing, setEditing] = useState(false);
  const [writing, setWriting] = useState(false);
  useRealtime((e) => ((e.type === 'team.checkin' && e.teamId === team.id) || e.type === 'reconnected') && reload());

  // Arriving from the reminder (…?checkin=1) opens the form straight away.
  useEffect(() => {
    if (startWriting && data?.is_member) setWriting(true);
  }, [startWriting, data?.is_member]);

  if (!data) return <Loading inline />;
  const mineToday = data.checkins.some((x) => x.user_id === me!.user.id && new Date(x.created_at).toDateString() === new Date().toDateString());
  const days = new Map<string, TeamCheckin[]>();
  for (const x of data.checkins) {
    const key = new Date(x.created_at).toDateString();
    days.set(key, [...(days.get(key) ?? []), x]);
  }

  return (
    <View style={{ gap: 14 }}>
      <Card style={{ gap: 10 }}>
        <Row gap={10} style={{ alignItems: 'flex-start' }}>
          <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="repeat" size={17} color={c.accentInk} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T weight="bold">{data.schedule?.enabled ? scheduleLabel(data.schedule) : data.schedule ? 'Check-in reminders are paused' : 'No recurring check-in yet'}</T>
            <Muted size={12}>
              {data.schedule?.enabled
                ? 'Everyone on the team is reminded at that time in their own time zone, unless they’re out of office.'
                : 'Ask the team for a short update — done, next, blockers — on a regular schedule.'}
            </Muted>
          </View>
        </Row>
        <Row gap={8} wrap>
          {data.is_member && <Button small icon="target" variant={mineToday ? 'secondary' : 'primary'} title={mineToday ? 'Add another update' : 'Check in now'} onPress={() => setWriting(true)} />}
          {data.can_edit && <Button small icon={data.schedule ? 'edit' : 'plus'} title={data.schedule ? 'Change schedule' : 'Set a schedule'} onPress={() => setEditing(true)} />}
        </Row>
      </Card>

      {!data.checkins.length && (
        <Empty icon="target" title="No check-ins in the last two weeks">
          {data.is_member ? 'Share the first one — what you got done, what’s next and anything in your way.' : 'Updates from the team show here.'}
        </Empty>
      )}
      {[...days.entries()].map(([key, list]) => (
        <View key={key} style={{ gap: 8 }}>
          <T size={13} weight="bold" tone="muted">
            {dayHeading(list[0].created_at)} · {list.length} update{list.length === 1 ? '' : 's'}
          </T>
          {list.map((x) => (
            <Card key={x.id} style={{ gap: 8 }}>
              <Row gap={8}>
                <Avatar user={{ id: x.user_id, name: x.user_name, color: x.user_color }} size="sm" />
                <T weight="bold" numberOfLines={1} style={{ flex: 1 }}>
                  {x.user_name}
                </T>
                <Muted size={12}>{new Date(x.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</Muted>
              </Row>
              {!!x.done && <Answer label="Done" text={x.done} />}
              {!!x.next && <Answer label="Next" text={x.next} />}
              {!!x.blockers && <Answer label="Blocked by" text={x.blockers} warn />}
            </Card>
          ))}
        </View>
      ))}

      {data.can_edit && <ScheduleSheet open={editing} onClose={() => setEditing(false)} teamId={team.id} schedule={data.schedule} onSaved={reload} />}
      <CheckinSheet open={writing} onClose={() => setWriting(false)} onDone={reload} team={team} />
    </View>
  );
}

function Answer({ label, text, warn }: { label: string; text: string; warn?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={[{ gap: 1 }, warn && { backgroundColor: c.amberSoft, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 }]}>
      <Muted size={12}>{label}</Muted>
      <T size={14}>{text}</T>
    </View>
  );
}

function ScheduleSheet({ open, onClose, teamId, schedule, onSaved }: { open: boolean; onClose: () => void; teamId: string; schedule: Schedule | null; onSaved: () => void }) {
  const act = useAction();
  const fallback: Schedule = { days: [1, 2, 3, 4, 5], time: '09:30', enabled: true };
  const [form, setForm] = useState<Schedule>(schedule ?? fallback);
  useEffect(() => {
    if (open) setForm(schedule ?? fallback);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const times = TIMES.includes(form.time) ? TIMES : [...TIMES, form.time].sort();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Check-in schedule"
      footer={
        <Button
          title="Save schedule"
          variant="primary"
          full
          disabled={!form.days.length}
          onPress={async () => {
            if (await act(() => api.put(`/teams/${teamId}/checkin-schedule`, form), 'Check-in schedule saved')) {
              onClose();
              onSaved();
            }
          }}
        />
      }
    >
      <Muted>When everyone on the team is asked for their update.</Muted>
      <Field label="Days" hint={form.days.length ? undefined : 'Choose at least one day.'}>
        <ChoiceChips options={WEEK.map((d) => ({ id: String(d), label: DAYS[d] }))} value={form.days.map(String)} onChange={(v: string[]) => setForm({ ...form, days: v.map(Number) })} />
      </Field>
      <Field label="Time" hint="In each person’s own time zone.">
        <Select title="Time" value={form.time} onChange={(time) => setForm({ ...form, time })} options={times.map((t) => ({ id: t, label: timeText(t) }))} />
      </Field>
      <Toggle label="Send reminders" hint="Turn off to pause without losing the schedule." value={form.enabled} onChange={(enabled) => setForm({ ...form, enabled })} />
    </Sheet>
  );
}
