import { notify, type Ctx } from './context.js';
import { isOutOfOffice, localDay } from './away.js';
import { now, parseJson } from './util.js';

/** How long after the scheduled time a reminder may still go out (e.g. after a restart). */
const WINDOW_MIN = 4 * 60;

/** Weekday (0 = Sunday) and HH:MM in a time zone. */
function localClock(timeZone: string | null | undefined, at: Date) {
  const tz = timeZone || 'UTC';
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(at);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
    return { weekday, time: `${get('hour').replace('24', '00')}:${get('minute')}` };
  } catch {
    return { weekday: at.getUTCDay(), time: at.toISOString().slice(11, 16) };
  }
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/**
 * Recurring team check-ins: on the team's days, at the team's time in each member's own time zone, ask every
 * member for their update — once a day, and not if they have already checked in or are out of office.
 */
export async function processCheckinPrompts(ctx: Ctx, at = new Date()) {
  const { db } = ctx;
  let sent = 0;
  const schedules = await db.all(
    `SELECT s.*, t.name AS team_name FROM team_checkin_schedules s JOIN teams t ON t.id = s.team_id WHERE s.enabled = 1`,
  );
  for (const s of schedules) {
    const days = parseJson<number[]>(s.days, []);
    const members = await db.all(
      `SELECT u.id, u.timezone, u.ooo_from, u.ooo_until FROM team_members tm JOIN users u ON u.id = tm.user_id
         JOIN memberships m ON m.user_id = u.id AND m.workspace_id = ? WHERE tm.team_id = ? AND m.deactivated_at IS NULL`,
      s.workspace_id,
      s.team_id,
    );
    for (const u of members) {
      const clock = localClock(u.timezone, at);
      const late = minutes(clock.time) - minutes(s.time);
      if (!days.includes(clock.weekday) || late < 0 || late > WINDOW_MIN || isOutOfOffice(u, at)) continue;
      const day = localDay(u.timezone, at);
      if (await db.get('SELECT 1 FROM checkin_prompts WHERE team_id = ? AND user_id = ? AND day = ?', s.team_id, u.id, day)) continue;
      // Already checked in for this team today (since their local midnight)?
      const midnight = new Date(at.getTime() - minutes(clock.time) * 60_000).toISOString();
      if (await db.get('SELECT 1 FROM checkins WHERE team_id = ? AND user_id = ? AND created_at >= ?', s.team_id, u.id, midnight)) continue;
      const first = await db.run('INSERT OR IGNORE INTO checkin_prompts (team_id, user_id, day, created_at) VALUES (?, ?, ?, ?)', s.team_id, u.id, day, now());
      if (!first.changes) continue;
      await notify(ctx, s.workspace_id, {
        userId: u.id,
        kind: 'checkin',
        title: `Time for the ${s.team_name} check-in`,
        body: 'What did you get done, what’s next, and is anything in your way?',
        link: `/teams/${s.team_id}?tab=checkins&checkin=1`,
      });
      sent += 1;
    }
  }
  return sent;
}
