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

test('one line becomes a task with a date, priority and owner', async ({ page }) => {
  const noErrors = trackErrors(page);
  await signIn(page, 'alex@acme.test');
  await page.goto('/my-work');
  const title = `Book the venue ${run()}`;
  await page.getByLabel('New task').fill(`${title} tomorrow !high`);
  const understood = page.locator('#quick-add-understood');
  await expect(understood).toContainText('Tomorrow');
  await expect(understood).toContainText('High');
  await page.getByLabel('New task').press('Enter');
  const row = page.locator('.task', { hasText: title });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Tomorrow');
  await expect(row).toContainText('High');
  // × on a chip keeps those words in the title.
  await page.getByLabel('New task').fill('Plan the friday party');
  await page.getByRole('button', { name: /Keep “friday” in the title/ }).click();
  await expect(understood).not.toContainText('Fri');
  noErrors();
});

test('the command palette jumps to places and runs commands; shortcuts work from the keyboard', async ({ page }) => {
  const noErrors = trackErrors(page);
  await signIn(page, 'alex@acme.test');
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Search' });
  await expect(palette.getByRole('group', { name: 'Commands' })).toBeVisible();
  await palette.getByRole('combobox', { name: 'Search' }).fill('general');
  await palette.getByRole('group', { name: 'Go to' }).getByRole('option', { name: '#general' }).click();
  await expect(page).toHaveURL(/\/channels\//);

  await page.keyboard.press('Control+k');
  await palette.getByRole('combobox', { name: 'Search' }).fill('create a task');
  await palette.getByRole('option', { name: /Create a task/ }).click();
  await expect(page.getByRole('dialog', { name: 'New task' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'New task' })).toBeHidden();

  // "?" lists the shortcuts; "g" then "f" goes to Files.
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeHidden();
  await page.keyboard.press('g');
  await page.keyboard.press('f');
  await expect(page).toHaveURL(/\/files$/);
  noErrors();
});

test('a chat shows where new messages start, ↑ edits your last message, and you can mark it unread', async ({ page, browser }) => {
  const noErrors = trackErrors(page);
  const ninaContext = await browser.newContext();
  const nina = await ninaContext.newPage();
  await signIn(nina, 'nina@acme.test');
  await signIn(page, 'jordan@acme.test');
  const jordanId = (await call(page, 'GET', '/me')).user.id;
  const dm = await call(nina, 'POST', '/dms', { userIds: [jordanId] });
  await page.goto(`/channels/${dm.id}`);
  await page.goto('/');
  const id = run();
  for (let i = 1; i <= 6; i++) await call(nina, 'POST', `/channels/${dm.id}/messages`, { body: `Update ${i} ${id}` });

  await page.goto(`/channels/${dm.id}`);
  const divider = page.getByRole('separator', { name: 'New messages' });
  await expect(divider).toBeAttached();
  // The divider sits just above the first new message.
  const firstNew = page.locator('.message', { hasText: `Update 1 ${id}` });
  expect(await divider.evaluate((d, m) => !!(d.compareDocumentPosition(m!) & Node.DOCUMENT_POSITION_FOLLOWING), await firstNew.elementHandle())).toBe(true);
  await expect(page.getByRole('button', { name: '6 new messages' })).toBeVisible();

  // ↑ in the empty box edits what you last wrote.
  const composer = page.getByRole('textbox', { name: /^Message / });
  await composer.fill(`Got it ${id}`);
  await composer.press('Enter');
  await expect(page.locator('.message:not(.outgoing)', { hasText: `Got it ${id}` })).toBeVisible();
  await composer.press('ArrowUp');
  const edit = page.getByRole('textbox', { name: 'Edit message' });
  await expect(edit).toBeFocused();
  await expect(edit).toHaveValue(`Got it ${id}`);
  await edit.press('Escape');
  await expect(edit).toBeHidden();

  // Mark unread from one of Nina's messages: the chat counts as unread again.
  const message = page.locator('.message', { hasText: `Update 5 ${id}` });
  await message.hover();
  await message.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Mark unread from here' }).click();
  await expect.poll(async () => (await call(page, 'GET', '/channels')).find((c: { id: string }) => c.id === dm.id).unread).toBe(2);
  await ninaContext.close();
  noErrors();
});

test('select several tasks and move them to tomorrow, then undo', async ({ page }) => {
  const noErrors = trackErrors(page);
  await signIn(page, 'alex@acme.test');
  const id = run();
  const later = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
  for (const n of [1, 2]) await call(page, 'POST', '/tasks', { title: `Bulk ${n} ${id}`, dueDate: later });
  await page.goto('/my-work');
  await page.getByRole('button', { name: 'Select' }).click();
  await page.getByRole('checkbox', { name: `Select Bulk 1 ${id}` }).click();
  await page.getByRole('checkbox', { name: `Select Bulk 2 ${id}` }).click();
  const bar = page.getByRole('toolbar', { name: '2 selected tasks' });
  await bar.getByRole('button', { name: 'Tomorrow' }).click();
  await expect(page.getByText('2 tasks moved to tomorrow')).toBeVisible();
  await expect(page.locator('.task', { hasText: `Bulk 1 ${id}` })).toContainText('Tomorrow');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.task', { hasText: `Bulk 1 ${id}` })).not.toContainText('Tomorrow');
  noErrors();
});
