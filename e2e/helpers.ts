import { expect, type Page } from '@playwright/test';

export const PASSWORD = 'softex-demo';

/** Fail the test on uncaught page errors; network failures for third-party fonts are ignored. */
export function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return () => expect(errors, 'uncaught page errors').toEqual([]);
}

export async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
}

/**
 * Elements that stick out past the right edge of the screen. The page clips
 * sideways overflow as a safety net, so comparing the page's width with the
 * screen's no longer catches a component that is too wide; this checks the
 * components themselves. Content inside its own scrolling or clipping box
 * (wide tables, tab rows, the timeline) is allowed to extend past the edge.
 */
export async function offscreen(page: Page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const insideScroller = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        // Only a box that itself fits on screen counts; a page-wide wrapper that clips doesn't excuse its contents.
        if (/(auto|scroll|hidden)/.test(getComputedStyle(p).overflowX) && p.getBoundingClientRect().right <= vw + 1) return true;
      }
      return false;
    };
    const bad: string[] = [];
    for (const el of document.querySelectorAll('body *')) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.position === 'fixed') continue;
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height || box.right <= vw + 1 || insideScroller(el)) continue;
      bad.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} (right edge ${Math.round(box.right)}px of ${vw}px)`);
    }
    return bad.slice(0, 5);
  });
}

/**
 * Safari's built-in stylesheet gives buttons `align-items: flex-start`, which
 * Chromium doesn't. Prepending it to the app's stylesheet makes Chromium lay
 * buttons out the way an iPhone does (the app's own rules still win).
 */
export async function emulateSafariButtons(page: Page) {
  await page.route(/\.css(\?|$)/, async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `button{align-items:flex-start}\n${await response.text()}` });
  });
}
