import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('mobile layout uses bottom navigation', async ({ page }) => {
  await signIn(page, 'maya@acme.test');
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await expect(nav).toBeVisible();
  await nav.getByRole('link', { name: 'My work' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'My work' })).toBeVisible();
  const width = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(width).toBeLessThanOrEqual(1);
});

test('message actions show only for the message you tap', async ({ page }) => {
  await signIn(page, 'maya@acme.test');
  await page.goto('/channels');
  await page.getByRole('link', { name: 'general' }).first().click();
  const rows = page.locator('.message:not(.deleted)');
  await expect(rows.first()).toBeVisible();
  const row = rows.last();
  const bar = row.getByRole('toolbar', { name: 'Message actions' });
  // Nothing shows until a message is tapped, and hidden bars can't be tapped by accident.
  await expect(page.getByRole('toolbar', { name: 'Message actions' }).first()).toHaveCSS('opacity', '0');
  await expect(bar).toHaveCSS('pointer-events', 'none');
  await row.locator('[data-slot="message-content"] p').first().tap();
  await expect(bar).toHaveCSS('opacity', '1');
  await expect(page.locator('.message[data-selected]')).toHaveCount(1);
  // Tapping elsewhere hides it again.
  await page.getByRole('heading', { level: 1 }).tap();
  await expect(bar).toHaveCSS('opacity', '0');
});
