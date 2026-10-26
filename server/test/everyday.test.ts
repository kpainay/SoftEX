import { afterEach, describe, expect, it } from 'vitest';
import { processCheckinPrompts } from '../src/checkins.js';
import { invite, registerOwner, setup, type TestEnv } from './helpers.js';

let env: TestEnv;
afterEach(async () => env?.cleanup());

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
type Note = { title: string; kind: string; body: string; link: string };
const unread = async (agent: ReturnType<TestEnv['agent']>) => (await agent.get('/api/notifications?filter=unread')).body.notifications as Note[];

describe('daily catch-up on Home', () => {
  it('counts what arrived since the last visit, and starts again after it', async () => {
    env = setup();
    const owner = await registerOwner(env, 'Ada');
    const bo = await invite(env, owner.agent, 'member', {}, 'Bo');
    const project = (await owner.agent.post('/api/projects').send({ name: 'Launch', memberIds: [bo.id] }).expect(201)).body;
    await owner.agent.post('/api/tasks').send({ title: 'Write the copy', ownerId: bo.id, projectId: project.id, dueDate: day(0) }).expect(201);
    const done = (await owner.agent.post('/api/tasks').send({ title: 'Book the room', projectId: project.id }).expect(201)).body;
    await owner.agent.patch(`/api/tasks/${done.id}`).send({ status: 'done' }).expect(200);
    await owner.agent.post('/api/decisions').send({ title: 'Ship on Friday', projectId: project.id }).expect(201);
    await owner.agent.post('/api/files').field('projectId', project.id).attach('file', Buffer.from('notes'), 'brief.txt').expect(201);
    const dm = (await owner.agent.post('/api/dms').send({ userIds: [bo.id] }).expect(201)).body;
    await owner.agent.post(`/api/channels/${dm.id}/messages`).send({ body: 'Morning!' }).expect(201);

    const home = (await bo.agent.get('/api/home').expect(200)).body;
    expect(home.catch_up).toEqual({ assigned: 1, completed: 1, chats: 1, decisions: 1, files: 1, due_today: 1 });

    // Ada's own work isn't news to Ada.
    expect((await owner.agent.get('/api/home')).body.catch_up).toMatchObject({ completed: 0, decisions: 0, files: 0 });

    await bo.agent.post('/api/home/seen').expect(200);
    expect((await bo.agent.get('/api/home')).body.catch_up).toMatchObject({ assigned: 0, completed: 0, decisions: 0, files: 0, due_today: 1 });
  });
});

describe('out of office', () => {
  it('answers direct messages once a day and tells whoever mentions them', async () => {
    env = setup();
    const owner = await registerOwner(env, 'Ada');
    const bo = await invite(env, owner.agent, 'member', {}, 'Bo Diaz');
    await bo.agent.patch('/api/me').send({ ooo_from: day(-1), ooo_until: day(5), ooo_message: 'Back next week. Ask Ada for anything urgent.' }).expect(200);
    const person = (await owner.agent.get(`/api/people/${bo.id}`).expect(200)).body;
    expect(person).toMatchObject({ ooo_from: day(-1), ooo_until: day(5), ooo_message: 'Back next week. Ask Ada for anything urgent.' });

    const dm = (await owner.agent.post('/api/dms').send({ userIds: [bo.id] }).expect(201)).body;
    await owner.agent.post(`/api/channels/${dm.id}/messages`).send({ body: 'Can you look at this?' }).expect(201);
    await owner.agent.post(`/api/channels/${dm.id}/messages`).send({ body: 'And this?' }).expect(201);
    const messages = (await owner.agent.get(`/api/channels/${dm.id}/messages`).expect(200)).body.messages as { body: string; auto_reply: boolean; user: { id: string } }[];
    const replies = messages.filter((m) => m.auto_reply);
    expect(replies).toHaveLength(1);
    expect(replies[0].user.id).toBe(bo.id);
    expect(replies[0].body).toContain('Bo is out of office until');
    expect(replies[0].body).toContain('Ask Ada for anything urgent.');

    const general = ((await owner.agent.get('/api/channels')).body as { id: string; name: string }[]).find((c) => c.name === 'general')!;
    for (const text of ['first', 'second']) await owner.agent.post(`/api/channels/${general.id}/messages`).send({ body: `@[Bo Diaz](${bo.id}) ${text}` }).expect(201);
    const away = (await unread(owner.agent)).filter((n) => n.kind === 'away');
    expect(away).toHaveLength(1);
    expect(away[0].title).toMatch(/^Bo Diaz is out of office until/);
    expect(away[0].link).toBe(`/people/${bo.id}`);
    // Nobody hears their own note back.
    expect((await unread(bo.agent)).some((n) => n.kind === 'away')).toBe(false);
  });

  it('only while the dates last, and checks them', async () => {
    env = setup();
    const owner = await registerOwner(env, 'Ada');
    const bo = await invite(env, owner.agent, 'member', {}, 'Bo');
    await bo.agent.patch('/api/me').send({ ooo_from: day(3), ooo_until: day(1) }).expect(400);
    await bo.agent.patch('/api/me').send({ ooo_from: day(3), ooo_until: day(6) }).expect(200);
    const dm = (await owner.agent.post('/api/dms').send({ userIds: [bo.id] }).expect(201)).body;
    await owner.agent.post(`/api/channels/${dm.id}/messages`).send({ body: 'Before the trip' }).expect(201);
    // Turning it off clears it.
    const me = (await bo.agent.patch('/api/me').send({ ooo_until: null }).expect(200)).body;
    expect(me.user).toMatchObject({ ooo_from: null, ooo_until: null });
    const messages = (await owner.agent.get(`/api/channels/${dm.id}/messages`)).body.messages as { auto_reply: boolean }[];
    expect(messages.some((m) => m.auto_reply)).toBe(false);
  });
});

describe('recurring team check-ins', () => {
  it('asks each team member once on the team’s days, and shows their answers to the team', async () => {
    env = setup();
    const owner = await registerOwner(env, 'Ada');
    const bo = await invite(env, owner.agent, 'member', {}, 'Bo');
    const cy = await invite(env, owner.agent, 'member', {}, 'Cy');
    const di = await invite(env, owner.agent, 'member', {}, 'Di');
    const team = (await owner.agent.post('/api/teams').send({ name: 'Design', memberIds: [bo.id, cy.id] }).expect(201)).body;

    // Only people on the team (or leads) set the schedule.
    await di.agent.put(`/api/teams/${team.id}/checkin-schedule`).send({ days: [1], time: '09:00' }).expect(403);
    await bo.agent.put(`/api/teams/${team.id}/checkin-schedule`).send({ days: [], time: '09:00' }).expect(400);
    await bo.agent.put(`/api/teams/${team.id}/checkin-schedule`).send({ days: [1, 3], time: '09:00' }).expect(200);
    expect((await di.agent.get(`/api/teams/${team.id}/checkins`).expect(200)).body).toMatchObject({ schedule: { days: [1, 3], time: '09:00', enabled: true }, can_edit: false });

    // Cy is away that week: no reminder for Cy.
    await cy.agent.patch('/api/me').send({ ooo_from: '2030-01-01', ooo_until: '2030-01-31' }).expect(200);
    const ctx = env.softex.ctx;
    // Monday 7 January 2030: 08:00 is too early, 09:10 is on time (for Ada, who made the team, and Bo); Tuesday is not a check-in day.
    expect(await processCheckinPrompts(ctx, new Date('2030-01-07T08:00:00Z'))).toBe(0);
    expect(await processCheckinPrompts(ctx, new Date('2030-01-07T09:10:00Z'))).toBe(2);
    expect(await processCheckinPrompts(ctx, new Date('2030-01-07T09:40:00Z'))).toBe(0);
    expect(await processCheckinPrompts(ctx, new Date('2030-01-08T09:10:00Z'))).toBe(0);
    const prompt = (await unread(bo.agent)).find((n) => n.kind === 'checkin')!;
    expect(prompt).toMatchObject({ title: 'Time for the Design check-in', link: `/teams/${team.id}?tab=checkins&checkin=1` });
    expect((await unread(cy.agent)).some((n) => n.kind === 'checkin')).toBe(false);
    expect((await unread(di.agent)).some((n) => n.kind === 'checkin')).toBe(false);

    await bo.agent.post('/api/checkins').send({ teamId: team.id, done: 'Icons', next: 'Colours' }).expect(201);
    await di.agent.post('/api/checkins').send({ teamId: team.id, done: 'Sneaky' }).expect(403);
    const board = (await cy.agent.get(`/api/teams/${team.id}/checkins`)).body;
    expect(board.checkins.map((c: { user_name: string; done: string }) => [c.user_name, c.done])).toEqual([['Bo', 'Icons']]);
    // Team check-ins live on the team page, not the general list.
    expect((await bo.agent.get('/api/checkins')).body).toEqual([]);

    // Switched off: nobody is asked.
    await bo.agent.put(`/api/teams/${team.id}/checkin-schedule`).send({ days: [1, 3], time: '09:00', enabled: false }).expect(200);
    expect(await processCheckinPrompts(ctx, new Date('2030-01-09T09:10:00Z'))).toBe(0);
  });
});

describe('saved task views', () => {
  it('filters tasks and keeps views private to their owner', async () => {
    env = setup();
    const owner = await registerOwner(env, 'Ada');
    const bo = await invite(env, owner.agent, 'member', {}, 'Bo');
    await owner.agent.post('/api/tasks').send({ title: 'Late and urgent', priority: 'urgent', dueDate: day(-2) }).expect(201);
    await owner.agent.post('/api/tasks').send({ title: 'Late but low', priority: 'low', dueDate: day(-2) }).expect(201);
    await owner.agent.post('/api/tasks').send({ title: 'Urgent next week', priority: 'urgent', dueDate: day(10) }).expect(201);
    await owner.agent.post('/api/tasks').send({ title: 'Nobody’s yet', ownerId: null }).expect(201);
    const titles = async (qs: string) => ((await owner.agent.get(`/api/tasks?${qs}`).expect(200)).body as { title: string }[]).map((t) => t.title).sort();

    expect(await titles('ownerId=me&priorities=high,urgent&due=overdue')).toEqual(['Late and urgent']);
    expect(await titles('due=later')).toEqual(['Urgent next week']);
    expect(await titles('q=late')).toEqual(['Late and urgent', 'Late but low']);
    await owner.agent.get('/api/tasks?priorities=bogus').expect(400);

    const view = (await owner.agent.post('/api/views').send({ name: 'On fire', filters: { ownerId: 'me', priorities: ['urgent'], due: 'overdue' } }).expect(201)).body;
    expect((await owner.agent.get('/api/views')).body).toEqual([expect.objectContaining({ id: view.id, name: 'On fire', filters: { ownerId: 'me', priorities: ['urgent'], due: 'overdue' } })]);
    await owner.agent.patch(`/api/views/${view.id}`).send({ name: 'Fires' }).expect(200);
    await owner.agent.post('/api/views').send({ name: 'Bad', filters: { statuses: ['nope'] } }).expect(400);

    // Bo can't see or change Ada's views.
    expect((await bo.agent.get('/api/views')).body).toEqual([]);
    await bo.agent.patch(`/api/views/${view.id}`).send({ name: 'Mine now' }).expect(404);
    await bo.agent.delete(`/api/views/${view.id}`).expect(404);
    await owner.agent.delete(`/api/views/${view.id}`).expect(200);
    expect((await owner.agent.get('/api/views')).body).toEqual([]);
  });
});
