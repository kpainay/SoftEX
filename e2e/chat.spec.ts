import { expect, request, test, type Page } from '@playwright/test';
import { PASSWORD, signIn } from './helpers';

/** A long history in two channels, posted by someone else, with one message of Maya's in the middle. */
async function seedHistory(baseURL: string, tag: string) {
  const login = async (email: string) => {
    const ctx = await request.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL } });
    expect((await ctx.post('/api/auth/login', { data: { email, password: PASSWORD } })).ok()).toBeTruthy();
    return ctx;
  };
  const alex = await login('alex@acme.test');
  const maya = await login('maya@acme.test');
  const channels = (await (await alex.get('/api/channels')).json()) as { id: string; name: string }[];
  const picked = ['general', 'brand-refresh'].map((name) => channels.find((c) => c.name === name)!);
  for (const ch of picked) {
    for (let i = 0; i < 30; i++) await alex.post(`/api/channels/${ch.id}/messages`, { data: { body: `${tag} line ${i} ${'lorem ipsum '.repeat((i % 4) + 1)}` } });
    await maya.post(`/api/channels/${ch.id}/messages`, { data: { body: `${tag} mine` } });
    for (let i = 30; i < 45; i++) await alex.post(`/api/channels/${ch.id}/messages`, { data: { body: `${tag} line ${i}` } });
  }
  return picked;
}

const viewport = (page: Page) => page.locator('[data-slot="message-scroller-viewport"]');
const distanceFromBottom = (page: Page) => viewport(page).evaluate((v) => Math.round(v.scrollHeight - v.clientHeight - v.scrollTop));

test('a chat opens at its latest message and stays there when you send', async ({ page, baseURL }) => {
  const tag = `scroll${Date.now() % 100000}`;
  const [general, brand] = await seedHistory(baseURL!, tag);
  await signIn(page, 'maya@acme.test');

  // Whichever answer arrives first — the chat's details or its messages — it opens at the bottom.
  for (const slow of [`**/api/channels/${general.id}`, `**/api/channels/${general.id}/messages*`]) {
    await page.route(slow, async (route) => {
      await new Promise((done) => setTimeout(done, 500));
      await route.continue();
    });
    await page.goto(`/channels/${general.id}`);
    await expect(page.locator('.message').filter({ hasText: `${tag} line 44` })).toBeInViewport();
    await expect.poll(() => distanceFromBottom(page)).toBeLessThanOrEqual(2);
    await page.unrouteAll();
  }

  // Scrolled to the top of one chat, then switching chats: the next one still opens at its latest message.
  await viewport(page).evaluate((v) => v.scrollTo({ top: 0 }));
  await page.getByRole('link', { name: 'brand-refresh' }).first().click();
  await expect(page.getByRole('heading', { name: 'brand-refresh' })).toBeVisible();
  await expect(page.locator('.message').filter({ hasText: `${tag} line 44` })).toBeInViewport();
  await expect.poll(() => distanceFromBottom(page)).toBeLessThanOrEqual(2);

  // Sending while scrolled up brings you down to the new message, with no blank space under it.
  await viewport(page).evaluate((v) => v.scrollTo({ top: 0 }));
  await page.getByRole('textbox', { name: 'Message #brand-refresh' }).fill(`${tag} sent`);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.locator('.message:not(.outgoing)').filter({ hasText: `${tag} sent` })).toBeInViewport();
  await expect.poll(() => distanceFromBottom(page)).toBeLessThanOrEqual(2);
  expect(brand).toBeTruthy();
});

test('message actions show on hover, unclipped', async ({ page, baseURL }) => {
  const tag = `hover${Date.now() % 100000}`;
  const [general] = await seedHistory(baseURL!, tag);
  await signIn(page, 'maya@acme.test');
  await page.goto(`/channels/${general.id}`);
  const row = page.locator('.message').filter({ hasText: `${tag} line 43` });
  const bar = row.getByRole('toolbar', { name: 'Message actions' });
  await expect(bar).toHaveCSS('opacity', '0');
  await row.hover();
  await expect(bar).toHaveCSS('opacity', '1');
  // The bar sits over the row's top edge; its top must be drawn, not cut off by the row.
  const topEdgeShows = await bar.evaluate((b) => {
    const r = b.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + 3);
    return !!hit && b.contains(hit);
  });
  expect(topEdgeShows).toBe(true);
});
