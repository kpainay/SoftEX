import type { Database } from './db.js';
import { now } from './util.js';

/** "@[Marketing](team:<id>)": how a message mentions a team. */
export const TEAM_MENTION = /@\[[^\]]+\]\(team:([0-9a-f-]{36})\)/g;

export function extractTeamMentionIds(body: string): string[] {
  return [...new Set([...body.matchAll(TEAM_MENTION)].map((m) => m[1]))];
}

/**
 * Everyone on a team is in the team's channels: run when a team channel is made and whenever the team
 * gains people. People who leave the team keep their place in its channels (like leaving a project) until
 * they leave or are removed.
 */
export async function syncTeamChannels(db: Database, teamId: string) {
  const members = (await db.all('SELECT user_id FROM team_members WHERE team_id = ?', teamId)).map((m) => m.user_id as string);
  const channels = await db.all("SELECT id FROM channels WHERE team_id = ? AND archived_at IS NULL AND kind != 'dm'", teamId);
  for (const c of channels) {
    for (const userId of members) {
      await db.run('INSERT OR IGNORE INTO channel_members (channel_id, user_id, joined_at) VALUES (?, ?, ?)', c.id, userId, now());
    }
  }
}
