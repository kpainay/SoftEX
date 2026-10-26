import { expect, test, type Page } from '@playwright/test';
import { signIn, trackErrors } from './helpers';

const call = (page: Page, method: string, path: string, body?: unknown) =>
  page.evaluate(
    async ({ method, path, body }) => {
      const res = await fetch(`/api${path}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      return res.json();
    },
    { method, path, body },
  );
const run = () => Date.now().toString(36);

test('Activities sits in the middle of the phone tab bar, with Chats where Inbox was', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'alex@acme.test');
  const tabs = page.getByRole('navigation', { name: 'Primary' }).locator('a, button');
  await expect(tabs).toHaveText([/Home/, /Chats/, /Activities/, /My work/, /Search/]);
  await tabs.nth(2).click();
  await expect(page).toHaveURL(/\/activities$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Activities' })).toBeVisible();
  // Old links still work.
  await page.goto('/inbox');
  await expect(page).toHaveURL(/\/activities$/);
});

test('settings is a list of categories: on a phone you open one and go back', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'alex@acme.test');
  await page.goto('/settings');
  const list = page.getByRole('navigation', { name: 'Settings categories' });
  await expect(list.getByRole('button')).toHaveText([/^Account/, /^Security/, /^Notifications/, /^General/, /^Developer/]);
  await list.getByRole('button', { name: /^Security/ }).click();
  await expect(page.getByRole('heading', { name: 'Multifactor authentication' })).toBeVisible();
  await expect(list).toBeHidden();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(list).toBeVisible();
  // Links from before the regrouping land in the right category.
  await page.goto('/settings?tab=notifications');
  await expect(page.getByRole('heading', { name: 'Focus time' })).toBeVisible();
});

test('the Files page has every file you can open, says where it was shared, and filters', async ({ page }) => {
  const noErrors = trackErrors(page);
  await signIn(page, 'alex@acme.test');
  const id = run();
  const general = (await call(page, 'GET', '/channels')).find((c: { name: string }) => c.name === 'general');
  await page.evaluate(
    async ({ channelId, id }) => {
      const form = new FormData();
      form.append('file', new Blob(['numbers'], { type: 'text/csv' }), `budget-${id}.csv`);
      const file = await (await fetch('/api/files', { method: 'POST', body: form })).json();
      await fetch(`/api/channels/${channelId}/messages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: 'Budget', fileIds: [file.id] }) });
    },
    { channelId: general.id, id },
  );
  await page.getByLabel('Workspace navigation').getByRole('link', { name: 'Files' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Files' })).toBeVisible();
  const row = page.getByRole('list', { name: 'Files' }).getByRole('listitem').filter({ hasText: `budget-${id}.csv` });
  await expect(row.getByRole('link', { name: '#general' })).toBeVisible();
  await page.getByLabel('File type').selectOption('sheet');
  await expect(row).toBeVisible();
  await page.getByLabel('File type').selectOption('image');
  await expect(row).toHaveCount(0);
  await page.getByLabel('File type').selectOption('all');
  await page.getByLabel('Shared in').selectOption('chat');
  await expect(row).toHaveCount(0);
  noErrors();
});

test('search shows a few results per group and opens a group up on request', async ({ page }) => {
  await signIn(page, 'alex@acme.test');
  const id = run();
  const general = (await call(page, 'GET', '/channels')).find((c: { name: string }) => c.name === 'general');
  for (let i = 0; i < 6; i++) await call(page, 'POST', `/channels/${general.id}/messages`, { body: `zebra${id} note ${i}` });
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox', { name: 'Search' }).fill(`zebra${id}`);
  const messages = page.getByRole('group', { name: /^Messages/ });
  await expect(messages.getByRole('option', { name: /zebra/ })).toHaveCount(4);
  await messages.getByRole('option', { name: 'Show 2 more messages' }).click();
  await expect(messages.getByRole('option', { name: /zebra/ })).toHaveCount(6);
});

test('notifications open on Unread, and Clear read deletes old ones', async ({ page, browser }) => {
  // Nina writes to Leo; Leo is the reader here.
  const ninaContext = await browser.newContext();
  const nina = await ninaContext.newPage();
  await signIn(nina, 'nina@acme.test');
  await signIn(page, 'leo@acme.test');
  const leoId = (await call(page, 'GET', '/me')).user.id;
  const dm = await call(nina, 'POST', '/dms', { userIds: [leoId] });
  await call(nina, 'POST', `/channels/${dm.id}/messages`, { body: `Old news ${run()}` });
  await call(page, 'POST', '/notifications/read-all');
  await call(nina, 'POST', '/tasks', { title: `Fresh ${run()}`, ownerId: leoId });
  await page.reload();

  await page.getByRole('button', { name: /^Notifications/ }).click();
  await expect(page.getByRole('tab', { name: /Unread/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.notif-item').first()).toContainText('Fresh');
  await page.getByRole('tab', { name: 'All' }).click();
  await expect(page.locator('.notif-item', { hasText: 'New message from Nina' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Clear read' }).click();
  await expect(page.locator('.notif-item', { hasText: 'New message from Nina' })).toHaveCount(0);
  await expect(page.locator('.notif-item', { hasText: 'Fresh' })).toHaveCount(1);
  await ninaContext.close();
});

test('the channel name opens its details: members, files, tasks and meetings', async ({ page }) => {
  const noErrors = trackErrors(page);
  await signIn(page, 'alex@acme.test');
  const general = (await call(page, 'GET', '/channels')).find((c: { name: string }) => c.name === 'general');
  const message = await call(page, 'POST', `/channels/${general.id}/messages`, { body: 'Order the banners' });
  const title = `Banners ${run()}`;
  await call(page, 'POST', '/tasks', { title, sourceMessageId: message.id });
  await page.goto(`/channels/${general.id}`);
  await page.getByRole('button', { name: 'Details for #general' }).click();
  const panel = page.getByRole('complementary', { name: 'Channel details' });
  await expect(panel.getByRole('heading', { name: 'Channel details' })).toBeVisible();
  await expect(panel.getByRole('region', { name: 'Members' })).toContainText('Maya Singh');
  await expect(panel.getByRole('region', { name: 'Tasks' }).getByRole('link', { name: title })).toBeVisible();
  noErrors();
});

test('give a task to a team: it waits in the team inbox until someone takes it', async ({ page }) => {
  const noErrors = trackErrors(page);
  await signIn(page, 'alex@acme.test');
  const team = (await call(page, 'GET', '/teams')).find((t: { name: string }) => t.name === 'Marketing');
  const title = `Poster ${run()}`;
  await page.goto(`/teams/${team.id}?tab=tasks`);
  await page.getByRole('button', { name: 'Give the team a task' }).click();
  await page.getByRole('dialog').getByLabel('Title').fill(title);
  await expect(page.getByRole('dialog').getByLabel('Owner')).toHaveValue(`team:${team.id}`);
  await page.getByRole('dialog').getByRole('button', { name: 'Create task' }).click();

  await page.getByRole('tab', { name: /^Inbox/ }).click();
  const waiting = page.getByRole('region', { name: 'Waiting for someone' });
  const row = waiting.getByRole('group', { name: title });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Take it' }).click();
  await expect(waiting.locator('.task', { hasText: title })).toHaveCount(0);
  // Now it's Alex's.
  await page.goto('/my-work');
  await expect(page.locator('.task', { hasText: title })).toBeVisible();
  noErrors();
});

test('New page goes straight to an untitled page with formatting buttons', async ({ page }) => {
  const noErrors = trackErrors(page);
  await signIn(page, 'alex@acme.test');
  await page.goto('/knowledge');
  await page.getByRole('button', { name: 'New page' }).click();
  const body = page.getByLabel('Page content');
  await expect(body).toBeFocused();
  await expect(page.getByLabel('Page title')).toHaveValue('Untitled');
  await body.pressSequentially('Remember the milk');
  await body.press('Shift+Home');
  await page.getByRole('toolbar', { name: 'Formatting' }).getByRole('button', { name: /^Bold/ }).click();
  await expect(body).toHaveValue('**Remember the milk**');
  await page.getByRole('toolbar', { name: 'Formatting' }).getByRole('button', { name: 'Checklist' }).click();
  await expect(body).toHaveValue('- [ ] **Remember the milk**');
  noErrors();
});

test('whiteboard: tap to type plain text, erase, and archive with a clear button', async ({ page }) => {
  const noErrors = trackErrors(page);
  await signIn(page, 'alex@acme.test');
  const board = await call(page, 'POST', '/boards', { title: `Sketch ${run()}` });
  await page.goto(`/boards/${board.id}`);
  const canvas = page.getByRole('img', { name: /^Whiteboard with/ });
  const tools = page.getByRole('toolbar', { name: 'Whiteboard tools' });
  const box = (await canvas.boundingBox())!;

  await tools.getByRole('button', { name: 'Text' }).click();
  await page.mouse.click(box.x + 200, box.y + 200);
  await expect(page.getByLabel('Edit text')).toBeFocused();
  await page.keyboard.type('Just a note');
  await page.mouse.click(box.x + 500, box.y + 400);
  await expect(canvas).toHaveAttribute('aria-label', 'Whiteboard with 1 item');
  await expect(canvas.locator('text', { hasText: 'Just a note' })).toBeVisible();

  await tools.getByRole('button', { name: /^Eraser/ }).click();
  await page.mouse.move(box.x + 190, box.y + 160);
  await page.mouse.down();
  await page.mouse.move(box.x + 230, box.y + 215, { steps: 10 });
  await page.mouse.up();
  await expect(canvas).toHaveAttribute('aria-label', 'Whiteboard with 0 items');

  await page.getByRole('button', { name: 'Archive whiteboard' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Archive' }).click();
  await expect(page).toHaveURL(/\/boards$/);
  noErrors();
});
