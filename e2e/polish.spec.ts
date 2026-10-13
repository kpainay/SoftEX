import { expect, test } from '@playwright/test';
import { emulateSafariButtons, offscreen, signIn, trackErrors } from './helpers';

test('phones never scroll sideways, and long tab rows scroll on their own', async ({ page }) => {
  const noErrors = trackErrors(page);
  await signIn(page, 'alex@acme.test');
  await page.setViewportSize({ width: 390, height: 844 });
  const projectId = await page.evaluate(async () => (await (await fetch('/api/projects')).json())[0].id);
  for (const path of ['/', '/inbox', '/chats', `/projects/${projectId}`, '/admin', '/meetings', '/workload', '/goals', '/help']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    expect(await offscreen(page), `sideways scroll on ${path}`).toEqual([]);
  }
  await expect(page.getByRole('button', { name: 'Notifications' }).or(page.locator('.notification')).first()).toBeInViewport();
  noErrors();
});

test('every screen size fits: no sideways scroll, and the message box keeps its send button inside', async ({ page }) => {
  const noErrors = trackErrors(page);
  await signIn(page, 'alex@acme.test');
  const { projectId, generalId } = await page.evaluate(async () => ({
    projectId: (await (await fetch('/api/projects')).json())[0].id,
    generalId: (await (await fetch('/api/channels')).json()).find((c: { name: string }) => c.name === 'general').id,
  }));
  const paths = [`/channels/${generalId}`, '/', '/meetings', '/people', '/admin', '/admin?tab=invitations', `/projects/${projectId}`, '/knowledge'];
  for (const width of [320, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    for (const path of paths) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      expect(await offscreen(page), `sideways scroll on ${path} at ${width}px`).toEqual([]);
      if (path.startsWith('/channels/')) {
        const [send, box] = await Promise.all([page.getByRole('button', { name: 'Send', exact: true }).first().boundingBox(), page.locator('.composer').first().boundingBox()]);
        expect(send!.x + send!.width, `send button inside the message box at ${width}px`).toBeLessThanOrEqual(box!.x + box!.width);
      }
    }
  }
  noErrors();
});

test('a direct message is filed under Chats, with a preview in the list', async ({ page }) => {
  await signIn(page, 'alex@acme.test');
  await page.goto('/chats');
  const row = page.locator('.list-row').filter({ hasText: 'Maya Singh' });
  // Other tests may reply first, so check there is a preview rather than its exact words.
  await expect(row.locator('.list-preview')).toHaveText(/Do you have 10 minutes|^You: /);
  await row.click();
  await expect(page.locator('.nav-item.active')).toHaveText(/Chats/);
});

test('owners of a new workspace get a setup guide', async ({ page }) => {
  await page.goto('/register');
  const run = Date.now().toString(36);
  await page.getByLabel('Your name').fill('Ama Boateng');
  await page.getByLabel('Work email').fill(`ama-${run}@example.com`);
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Show' }).click();
  await expect(page.getByLabel('Password')).toHaveAttribute('type', 'text');
  await page.getByLabel('Workspace name').fill(`Boateng ${run}`);
  await page.getByRole('button', { name: 'Create workspace' }).click();
  const guide = page.getByRole('region', { name: 'Get started' });
  await expect(guide).toContainText(/0 of 5 done/);
  await expect(guide.getByRole('link', { name: 'Invite people' })).toBeVisible();
  await expect(page.getByText('Recent activity in your workspace')).toBeVisible();
  await guide.getByRole('button', { name: 'Hide' }).click();
  await expect(guide).toBeHidden();
});

test('long titles, names and links fit on an iPhone-sized screen', async ({ page }) => {
  const noErrors = trackErrors(page);
  await emulateSafariButtons(page);
  await signIn(page, 'alex@acme.test');
  // The kind of content people really type: long sentences, long names, links with no spaces.
  const ids = await page.evaluate(async () => {
    const post = async (path: string, body: unknown) =>
      (await fetch(`/api${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
    const me = await (await fetch('/api/me')).json();
    const today = new Date().toISOString().slice(0, 10);
    const project = await post('/projects', { name: 'Mobile point of sale rollout for retailers across Montserrado County' });
    const task = await post('/tasks', {
      title: 'Send the final version of the point of sale app to the CTO for review and support before the investor meeting',
      projectId: project.id, ownerId: me.user?.id ?? me.id, dueDate: today, status: 'in_progress',
    });
    await post('/tasks', { title: 'Review https://docs.example.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit?usp=sharing', projectId: project.id, ownerId: me.user?.id ?? me.id, dueDate: today });
    const channel = await post('/channels', { name: `pos-launch-coordination-${Date.now().toString(36)}`, topic: 'Coordinating the launch with every retail partner and field agent in Monrovia' });
    await post(`/channels/${channel.id}/messages`, { body: 'Build: https://drive.example.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789AbCdEfGh/view?usp=sharing' });
    const goal = await post('/goals', { title: 'Grow adoption to two hundred active retailers across Montserrado County this quarter' });
    return { project: project.id, task: task.id, channel: channel.id, goal: goal.id };
  });
  const paths = ['/', '/my-work', '/inbox', '/goals', `/goals/${ids.goal}`, `/projects/${ids.project}`, `/tasks/${ids.task}`, `/channels/${ids.channel}`, '/directory'];
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of paths) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      expect(await offscreen(page), `${path} at ${width}px`).toEqual([]);
    }
    // Long task titles wrap inside their card instead of running past it.
    await page.goto('/');
    const title = page.locator('.task-body strong').filter({ hasText: 'Send the final version' }).first();
    const [titleBox, cardBox] = await Promise.all([title.boundingBox(), title.locator('xpath=ancestor::article[1]').boundingBox()]);
    expect(titleBox!.x + titleBox!.width, `task title inside its card at ${width}px`).toBeLessThanOrEqual(cardBox!.x + cardBox!.width);
    // The task drawer shows the whole title.
    await title.click();
    const input = page.getByRole('dialog', { name: 'Task details' }).getByLabel('Task title');
    expect(await input.evaluate((el) => el.scrollHeight <= el.clientHeight + 1), `whole title visible at ${width}px`).toBe(true);
    // Still in full after the screen gets narrower with the drawer open (rotation, split screen).
    await page.setViewportSize({ width: Math.round(width * 0.65), height: 844 });
    await expect.poll(() => input.evaluate((el) => el.scrollHeight <= el.clientHeight + 1), { message: `whole title visible after narrowing from ${width}px` }).toBe(true);
    await page.setViewportSize({ width, height: 844 });
    await page.keyboard.press('Escape');
  }
  noErrors();
});
