import { afterEach, describe, expect, it } from 'vitest';
import { invite, registerOwner, setup, type TestEnv } from './helpers.js';

let env: TestEnv;
afterEach(async () => env?.cleanup());

/** A workspace with a team of two (Bo and Cy) and someone who isn't on it (Di). */
async function teamSetup() {
  env = setup();
  const owner = await registerOwner(env, 'Ada');
  const bo = await invite(env, owner.agent, 'member', {}, 'Bo');
  const cy = await invite(env, owner.agent, 'member', {}, 'Cy');
  const di = await invite(env, owner.agent, 'member', {}, 'Di');
  const team = (await owner.agent.post('/api/teams').send({ name: 'Design', memberIds: [bo.id, cy.id] }).expect(201)).body;
  const unread = async (agent: typeof bo.agent) => (await agent.get('/api/notifications?filter=unread')).body.notifications as { title: string; link: string }[];
  return { owner, bo, cy, di, team, unread };
}

describe('teams', () => {
  it('team channels include everyone on the team, including people who join later', async () => {
    const { owner, bo, di, team } = await teamSetup();
    const channel = (await owner.agent.post('/api/channels').send({ name: 'design-crit', kind: 'private', teamId: team.id }).expect(201)).body;
    const memberNames = async () => (await owner.agent.get(`/api/channels/${channel.id}`)).body.members.map((m: { name: string }) => m.name);
    expect(await memberNames()).toEqual(expect.arrayContaining(['Bo', 'Cy']));
    expect(await memberNames()).not.toContain('Di');
    await bo.agent.get(`/api/channels/${channel.id}`).expect(200);

    await owner.agent.patch(`/api/teams/${team.id}`).send({ memberIds: [owner.me.user.id, bo.id, di.id] }).expect(200);
    expect(await memberNames()).toContain('Di');
    // The team page lists it.
    const page = (await di.agent.get(`/api/teams/${team.id}`).expect(200)).body;
    expect(page.channels.map((c: { name: string }) => c.name)).toEqual(['design-crit']);
    expect(page.is_member).toBe(true);
  });

  it('a task given to a team is told to the team, shows in their work until someone picks it up, and stays private to them', async () => {
    const { owner, bo, cy, di, team, unread } = await teamSetup();
    const task = (await owner.agent.post('/api/tasks').send({ title: 'Refresh the icons', teamId: team.id }).expect(201)).body;
    expect(task.owner).toBeNull();
    expect(task.team).toEqual({ id: team.id, name: 'Design' });

    for (const person of [bo, cy]) expect((await unread(person.agent)).map((n) => n.title)).toContain('Ada gave Design “Refresh the icons”');
    expect((await unread(di.agent)).length).toBe(0);
    await di.agent.get(`/api/tasks/${task.id}`).expect(404);

    // In the team's inbox and in each member's work, unclaimed.
    expect((await cy.agent.get(`/api/teams/${team.id}/inbox`)).body.tasks.map((t: { title: string }) => t.title)).toEqual(['Refresh the icons']);
    expect((await cy.agent.get('/api/my-work')).body.team.map((t: { title: string }) => t.title)).toEqual(['Refresh the icons']);

    // Bo picks it up: it's Bo's now, and no longer waiting in Cy's work.
    await bo.agent.patch(`/api/tasks/${task.id}`).send({ ownerId: bo.id }).expect(200);
    expect((await cy.agent.get('/api/my-work')).body.team).toEqual([]);
    expect((await bo.agent.get('/api/my-work')).body.later.map((t: { title: string }) => t.title)).toContain('Refresh the icons');
  });

  it('files shared with a team are for the team only', async () => {
    const { bo, cy, di, team } = await teamSetup();
    await bo.agent.post('/api/files').field('teamId', team.id).attach('file', Buffer.from('brand'), 'palette.txt').expect(201);
    await di.agent.post('/api/files').field('teamId', team.id).attach('file', Buffer.from('x'), 'nope.txt').expect(403);

    const forCy = (await cy.agent.get(`/api/files?teamId=${team.id}`).expect(200)).body;
    expect(forCy.map((f: { name: string }) => f.name)).toEqual(['palette.txt']);
    expect(forCy[0].place).toEqual({ kind: 'team', name: 'Design', link: `/teams/${team.id}` });
    expect((await di.agent.get('/api/files')).body.map((f: { name: string }) => f.name)).not.toContain('palette.txt');
  });

  it('@mentioning a team notifies its members and lands in the team inbox', async () => {
    const { owner, bo, di, team, unread } = await teamSetup();
    const general = (await owner.agent.get('/api/channels')).body.find((c: { name: string }) => c.name === 'general');
    await owner.agent.post(`/api/channels/${general.id}/messages`).send({ body: `@[Design](team:${team.id}) can someone review the deck?` }).expect(201);

    expect((await unread(bo.agent)).map((n) => n.title)).toContain('Ada mentioned @Design in #general');
    expect((await unread(di.agent)).length).toBe(0);
    const inbox = (await bo.agent.get(`/api/teams/${team.id}/inbox`).expect(200)).body;
    expect(inbox.mentions.map((m: { body: string; channel: { name: string } }) => [m.channel.name, m.body])).toEqual([['general', `@[Design](team:${team.id}) can someone review the deck?`]]);
  });
});
