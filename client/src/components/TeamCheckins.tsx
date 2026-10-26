import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useApi, useRealtime } from '../hooks';
import { useSession } from '../session';
import { CheckinModal } from '../pages/Home';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { Callout, EmptyState, FilterChips, FormField, LoadingRows, Modal, SwitchField, TimePicker, useAction } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

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

/** "Weekdays at 9:30 AM", "Mon, Wed and Fri at 9:30 AM". */
export function scheduleLabel(s: Schedule) {
  const days = [...s.days].sort((a, b) => WEEK.indexOf(a) - WEEK.indexOf(b));
  const when =
    days.length === 7
      ? 'Every day'
      : days.join() === '1,2,3,4,5'
        ? 'Weekdays'
        : days.length === 1
          ? `Every ${DAYS[days[0]]}`
          : `${days.slice(0, -1).map((d) => DAYS[d]).join(', ')} and ${DAYS[days[days.length - 1]]}`;
  const [h, m] = s.time.split(':').map(Number);
  const time = new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${when} at ${time}`;
}

const dayHeading = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
};

/** A team's recurring check-in: when people are asked, and what they said, day by day. */
export function TeamCheckins({ team }: { team: { id: string; name: string } }) {
  const { me } = useSession();
  const [params, setParams] = useSearchParams();
  const { data, reload } = useApi<CheckinBoard>(`/teams/${team.id}/checkins`);
  const [editing, setEditing] = useState(false);
  const [writing, setWriting] = useState(false);
  useRealtime((e) => (e.type === 'team.checkin' && e.teamId === team.id) || e.type === 'reconnected' ? reload() : undefined);

  // Arriving from the reminder (…?checkin=1) opens the form straight away.
  useEffect(() => {
    if (params.get('checkin') !== '1' || !data?.is_member) return;
    setWriting(true);
    const next = new URLSearchParams(params);
    next.delete('checkin');
    setParams(next, { replace: true });
  }, [params, data?.is_member, setParams]);

  if (!data) return <LoadingRows rows={4} />;
  const mineToday = data.checkins.some((c) => c.user_id === me!.user.id && new Date(c.created_at).toDateString() === new Date().toDateString());
  const days = new Map<string, TeamCheckin[]>();
  for (const c of data.checkins) {
    const key = new Date(c.created_at).toDateString();
    days.set(key, [...(days.get(key) ?? []), c]);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card size="sm">
        <CardContent className="flex flex-wrap items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Icon name="repeat" size={18} />
          </span>
          <div className="flex min-w-0 flex-1 basis-56 flex-col">
            <strong className="text-sm font-semibold">
              {data.schedule?.enabled ? scheduleLabel(data.schedule) : data.schedule ? 'Check-in reminders are paused' : 'No recurring check-in yet'}
            </strong>
            <span className="text-xs text-muted-foreground">
              {data.schedule?.enabled
                ? 'Everyone on the team is reminded at that time in their own time zone, unless they’re out of office.'
                : 'Ask the team for a short update — done, next, blockers — on a regular schedule.'}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.can_edit && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Icon name={data.schedule ? 'edit' : 'plus'} data-icon="inline-start" /> {data.schedule ? 'Change schedule' : 'Set a schedule'}
              </Button>
            )}
            {data.is_member && (
              <Button size="sm" variant={mineToday ? 'outline' : 'default'} onClick={() => setWriting(true)}>
                <Icon name="target" data-icon="inline-start" /> {mineToday ? 'Add another update' : 'Check in now'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {!data.checkins.length && (
        <EmptyState icon="target" title="No check-ins in the last two weeks">
          {data.is_member ? 'Share the first one — what you got done, what’s next and anything in your way.' : 'Updates from the team show here.'}
        </EmptyState>
      )}
      {[...days.entries()].map(([key, list]) => (
        <section key={key} aria-label={dayHeading(list[0].created_at)} className="flex flex-col gap-2">
          <h2 className="font-heading text-sm font-semibold text-muted-foreground">
            {dayHeading(list[0].created_at)} · {list.length} update{list.length === 1 ? '' : 's'}
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {list.map((c) => (
              <Card key={c.id} size="sm">
                <CardContent className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Avatar user={{ id: c.user_id, name: c.user_name, color: c.user_color }} size="sm" />
                    <strong className="min-w-0 truncate text-sm font-semibold">{c.user_name}</strong>
                    <time className="ml-auto shrink-0 text-xs text-muted-foreground" dateTime={c.created_at}>
                      {new Date(c.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                    </time>
                  </div>
                  <dl className="flex flex-col gap-1.5 text-sm">
                    {c.done && <Answer label="Done" text={c.done} />}
                    {c.next && <Answer label="Next" text={c.next} />}
                    {c.blockers && <Answer label="Blocked by" text={c.blockers} warn />}
                  </dl>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ))}

      {data.can_edit && <ScheduleModal open={editing} onClose={() => setEditing(false)} teamId={team.id} schedule={data.schedule} onSaved={reload} />}
      <CheckinModal open={writing} onClose={() => setWriting(false)} onDone={reload} team={team} />
    </div>
  );
}

function Answer({ label, text, warn }: { label: string; text: string; warn?: boolean }) {
  return (
    <div className={warn ? 'rounded-lg bg-warning/10 px-2 py-1' : undefined}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-line break-words">{text}</dd>
    </div>
  );
}

function ScheduleModal({ open, onClose, teamId, schedule, onSaved }: { open: boolean; onClose: () => void; teamId: string; schedule: Schedule | null; onSaved: () => void }) {
  const act = useAction();
  const [form, setForm] = useState<Schedule>(schedule ?? { days: [1, 2, 3, 4, 5], time: '09:30', enabled: true });
  useEffect(() => {
    if (open) setForm(schedule ?? { days: [1, 2, 3, 4, 5], time: '09:30', enabled: true });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal open={open} onClose={onClose} title="Check-in schedule" description="When everyone on the team is asked for their update.">
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await act(() => api.put(`/teams/${teamId}/checkin-schedule`, form), 'Check-in schedule saved')) {
            onClose();
            onSaved();
          }
        }}
      >
        <FormField label="Days">
          <FilterChips
            aria-label="Days"
            options={WEEK.map((d) => ({ value: String(d), label: DAYS[d] }))}
            value={form.days.map(String)}
            onChange={(v) => setForm({ ...form, days: v.map(Number) })}
          />
        </FormField>
        <FormField label="Time" hint="In each person’s own time zone." className="w-auto">
          <TimePicker value={form.time} onChange={(v) => setForm({ ...form, time: v })} aria-label="Time" />
        </FormField>
        <SwitchField label="Send reminders" description="Turn off to pause without losing the schedule." checked={form.enabled} onCheckedChange={(enabled) => setForm({ ...form, enabled })} />
        {!form.days.length && <Callout tone="warning">Choose at least one day.</Callout>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!form.days.length || !/^\d{2}:\d{2}$/.test(form.time)}>
            Save schedule
          </Button>
        </div>
      </form>
    </Modal>
  );
}
