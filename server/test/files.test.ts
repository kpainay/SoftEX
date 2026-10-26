import { afterEach, describe, expect, it } from 'vitest';
import { invite, registerOwner, setup, type TestEnv } from './helpers.js';

let env: TestEnv;
afterEach(async () => env?.cleanup());

describe('files', () => {
  it('lists every file you can open with where it was shared, and none from chats you are not in', async () => {
    env = setup();
    const owner = await registerOwner(env, 'Ada');
    const bo = await invite(env, owner.agent, 'member', {}, 'Bo');
    const cy = await invite(env, owner.agent, 'member', {}, 'Cy');
    const general = (await owner.agent.get('/api/channels')).body.find((c: { name: string }) => c.name === 'general');
    const dm = (await owner.agent.post('/api/dms').send({ userIds: [bo.id] })).body;

    const shareIn = async (channelId: string, name: string) => {
      const file = (await owner.agent.post('/api/files').attach('file', Buffer.from('hello'), name)).body;
      await owner.agent.post(`/api/channels/${channelId}/messages`).send({ body: 'Here you go', fileIds: [file.id] }).expect(201);
      return file;
    };
    await shareIn(general.id, 'plan.txt');
    await shareIn(dm.id, 'private.txt');

    const forBo = (await bo.agent.get('/api/files').expect(200)).body;
    const place = (name: string) => forBo.find((f: { name: string }) => f.name === name)?.place;
    expect(place('plan.txt')).toEqual({ kind: 'channel', name: 'general', link: `/channels/${general.id}` });
    expect(place('private.txt')).toEqual({ kind: 'chat', name: 'Ada', link: `/channels/${dm.id}` });

    // Cy is not in the chat, so its file is not listed for them.
    const forCy = (await cy.agent.get('/api/files').expect(200)).body.map((f: { name: string }) => f.name);
    expect(forCy).toContain('plan.txt');
    expect(forCy).not.toContain('private.txt');

    // Narrowed to one channel (the channel details page).
    const inGeneral = (await bo.agent.get(`/api/files?channelId=${general.id}`).expect(200)).body.map((f: { name: string }) => f.name);
    expect(inGeneral).toEqual(['plan.txt']);
  });
});

describe('channel details', () => {
  it('shows the tasks made from a channel, its meetings, and its file and pin counts', async () => {
    env = setup();
    const owner = await registerOwner(env, 'Ada');
    const bo = await invite(env, owner.agent, 'member', {}, 'Bo');
    const general = (await owner.agent.get('/api/channels')).body.find((c: { name: string }) => c.name === 'general');
    const message = (await owner.agent.post(`/api/channels/${general.id}/messages`).send({ body: 'Someone should book the venue' })).body;
    await owner.agent.post(`/api/messages/${message.id}/pin`).expect((r) => expect(r.status).toBeLessThan(300));
    await owner.agent.post('/api/tasks').send({ title: 'Book the venue', sourceMessageId: message.id, ownerId: bo.id }).expect(201);
    await owner.agent.post('/api/tasks').send({ title: 'Unrelated' }).expect(201);
    const soon = new Date(Date.now() + 86_400_000).toISOString();
    const past = new Date(Date.now() - 86_400_000).toISOString();
    await owner.agent.post('/api/meetings').send({ title: 'Last week', startsAt: past, channelId: general.id }).expect(201);
    await owner.agent.post('/api/meetings').send({ title: 'Venue walk-through', startsAt: soon, channelId: general.id }).expect(201);
    const file = (await owner.agent.post('/api/files').attach('file', Buffer.from('hi'), 'floorplan.txt')).body;
    await owner.agent.post(`/api/channels/${general.id}/messages`).send({ body: 'Plan', fileIds: [file.id] });

    const overview = (await bo.agent.get(`/api/channels/${general.id}/overview`).expect(200)).body;
    expect(overview.created_by.name).toBe('Ada');
    expect(overview.tasks.map((t: { title: string }) => t.title)).toEqual(['Book the venue']);
    expect(overview.tasks[0].owner.name).toBe('Bo');
    // Upcoming first, then past.
    expect(overview.meetings.map((m: { title: string }) => m.title)).toEqual(['Venue walk-through', 'Last week']);
    expect(overview.file_count).toBe(1);
    expect(overview.pin_count).toBe(1);
  });
});

describe('pages', () => {
  it('can be started without a title, and get "Untitled" until named', async () => {
    env = setup();
    const owner = await registerOwner(env, 'Ada');
    const page = (await owner.agent.post('/api/pages').send({}).expect(201)).body;
    expect(page.title).toBe('Untitled');
    const blank = (await owner.agent.post('/api/pages').send({ title: '   ' }).expect(201)).body;
    expect(blank.title).toBe('Untitled');
    await owner.agent.patch(`/api/pages/${page.id}`).send({ title: 'Packing list', body: '- [ ] Passport' }).expect(200);
    expect((await owner.agent.get(`/api/pages/${page.id}`)).body.title).toBe('Packing list');
  });
});
