import { expect, test } from '@playwright/test';
import { signIn, trackErrors } from './helpers';

test('a sent message shows at once, settles when the server has it, and can be retried if sending fails', async ({ page }) => {
  const noErrors = trackErrors(page);
  await signIn(page, 'alex@acme.test');
  await page.goto('/channels');
  await page.getByRole('link', { name: 'general' }).first().click();
  const composer = page.getByRole('textbox', { name: 'Message #general' });
  const run = Date.now().toString(36);

  // A slow server: the message is on screen (and the box empty) long before it answers.
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route('**/api/channels/*/messages', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await held;
    await route.continue();
  });
  await composer.fill(`Instant ${run}`);
  await composer.press('Enter');
  const sending = page.locator('.message.outgoing').filter({ hasText: `Instant ${run}` });
  await expect(sending).toBeVisible();
  await expect(sending).toContainText('Sending…');
  await expect(composer).toHaveValue('');
  release();
  // Settles into an ordinary message, shown once.
  await expect(page.locator('.message:not(.outgoing)').filter({ hasText: `Instant ${run}` })).toHaveCount(1);
  await expect(page.locator('.message.outgoing')).toHaveCount(0);
  await page.unroute('**/api/channels/*/messages');

  // The server is unreachable: the message stays with Retry, and Edit puts it back in the box.
  await page.route('**/api/channels/*/messages', (route) => (route.request().method() === 'POST' ? route.abort() : route.continue()));
  await composer.fill(`Offline ${run}`);
  await composer.press('Enter');
  const failed = page.locator('.message.outgoing.failed').filter({ hasText: `Offline ${run}` });
  await expect(failed).toContainText('Not sent');
  await failed.getByRole('button', { name: 'Edit' }).click();
  await expect(composer).toHaveValue(`Offline ${run}`);
  await expect(failed).toHaveCount(0);
  await composer.press('Enter');
  await expect(failed).toBeVisible();
  await page.unroute('**/api/channels/*/messages');
  await failed.getByRole('button', { name: 'Retry' }).click();
  await expect(page.locator('.message:not(.outgoing)').filter({ hasText: `Offline ${run}` })).toHaveCount(1);
  await expect(page.locator('.message.outgoing')).toHaveCount(0);
  noErrors();
});

test('reactions and ticking off a task show before the server answers', async ({ page }) => {
  await signIn(page, 'alex@acme.test');
  // Hold every reaction and task update until the screen has been checked.
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route(/\/api\/(messages\/[^/]+\/reactions|tasks\/[^/]+)$/, async (route) => {
    if (!['POST', 'PATCH'].includes(route.request().method())) return route.continue();
    await held;
    await route.continue();
  });

  const task = await page.evaluate(async () => {
    const res = await fetch('/api/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: `Tick ${Date.now()}` }) });
    return res.json();
  });
  await page.goto('/my-work');
  const box = page.getByRole('checkbox', { name: `Mark ${task.title} done` });
  await box.check();
  await expect(page.locator('.task.is-done').filter({ hasText: task.title })).toBeVisible();

  // A fresh message, so the reaction starts off.
  const text = `React to me ${Date.now()}`;
  await page.evaluate(async (body) => {
    const channels = await (await fetch('/api/channels')).json();
    const general = channels.find((c: { name: string }) => c.name === 'general');
    await fetch(`/api/channels/${general.id}/messages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body }) });
  }, text);
  await page.goto('/channels');
  await page.getByRole('link', { name: 'general' }).first().click();
  const message = page.locator('.message:not(.outgoing)').filter({ hasText: text });
  await message.hover();
  await message.getByRole('button', { name: 'Add reaction' }).click();
  await message.getByRole('button', { name: 'React 🎉' }).click();
  await expect(message.locator('.reaction.mine', { hasText: '🎉' })).toBeVisible();
  release();
});
