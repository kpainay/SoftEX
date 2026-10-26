import type { Auth } from './access.js';
import type { Row } from './db.js';
import { notify, publishToChannel, type Ctx } from './context.js';
import { friendlyDate, newId, now } from './util.js';
import { serializeMessages } from './routes/channels.js';

/** Today's date (YYYY-MM-DD) in a time zone; UTC when the zone is unknown. */
export function localDay(timeZone: string | null | undefined, at = new Date()) {
  try {
    return at.toLocaleDateString('en-CA', { timeZone: timeZone || 'UTC' });
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

/** Whether someone is out of office today (their dates are inclusive, in their own time zone). */
export function isOutOfOffice(user: Row | null | undefined, at = new Date()) {
  if (!user?.ooo_until) return false;
  const day = localDay(user.timezone, at);
  return (!user.ooo_from || user.ooo_from <= day) && day <= user.ooo_until;
}

/** "Maya is out of office until Fri, Nov 20." plus their own note, if they wrote one. */
export function awayNote(user: Row) {
  const until = `${user.name.split(' ')[0]} is out of office until ${friendlyDate(user.ooo_until)}.`;
  return user.ooo_message?.trim() ? `${until}\n\n${user.ooo_message.trim()}` : until;
}

const DAY_MS = 24 * 3_600_000;

/**
 * Automatic replies for people who are out of office. In a direct message their note is posted in the
 * conversation (once a day per conversation); when they are @mentioned elsewhere, whoever mentioned them gets
 * the note as a notification (once a day per person). Never sent to the person themselves.
 */
export async function sendAutoReplies(ctx: Ctx, auth: Auth, channel: Row, people: { dm: string[]; mentioned: string[] }) {
  const { db } = ctx;
  const ids = [...new Set([...people.dm, ...people.mentioned])].filter((id) => id !== auth.userId);
  if (!ids.length) return;
  const away = (await db.all(
    `SELECT id, name, timezone, ooo_from, ooo_until, ooo_message FROM users WHERE ooo_until IS NOT NULL AND id IN (${ids.map(() => '?').join(',')})`,
    ...ids,
  )).filter((u) => isOutOfOffice(u));
  const dayAgo = new Date(Date.now() - DAY_MS).toISOString();
  for (const user of away) {
    if (channel.kind === 'dm' && people.dm.includes(user.id)) {
      if (await db.get('SELECT 1 FROM messages WHERE channel_id = ? AND user_id = ? AND auto_reply = 1 AND created_at > ?', channel.id, user.id, dayAgo)) continue;
      const id = newId();
      await db.insert('messages', { id, channel_id: channel.id, user_id: user.id, body: awayNote(user), auto_reply: true, created_at: now() });
      const [message] = await serializeMessages(db, { userId: user.id, workspaceId: auth.workspaceId, role: 'member' }, [(await db.get('SELECT * FROM messages WHERE id = ?', id))!]);
      await publishToChannel(ctx, channel, { type: 'message.created', message });
    } else if (people.mentioned.includes(user.id)) {
      const told = await db.get(
        `SELECT 1 FROM notifications WHERE user_id = ? AND workspace_id = ? AND kind = 'away' AND actor_id = ? AND created_at > ?`,
        auth.userId,
        auth.workspaceId,
        user.id,
        dayAgo,
      );
      if (told) continue;
      await notify(ctx, auth.workspaceId, {
        userId: auth.userId,
        kind: 'away',
        title: `${user.name} is out of office until ${friendlyDate(user.ooo_until)}`,
        body: user.ooo_message?.trim() || undefined,
        link: `/people/${user.id}`,
        actorId: user.id,
      });
    }
  }
}
