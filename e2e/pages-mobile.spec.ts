import { guestTest as test, expect, unexpectedWrites } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * Guest smoke tests for the main pages in docs/qa.md, in a phone browser:
 * the page loads, its main content shows up, and nothing scrolls sideways.
 * No login and no keys: every API write is refused by the fixture.
 *
 * The post and profile are long-lived public Hive content, so they never
 * disappear. Content that comes from Hive gets a long timeout, because a
 * slow public node should not fail the build.
 */
const HIVE_TIMEOUT = 45_000;

const POST = { path: '/@hiveio/announcing-the-launch-of-hive-blockchain', title: 'Announcing the Launch of Hive Blockchain' };
const PROFILE = { path: '/@hiveio', name: 'hiveio' };

async function open(page: Page, path: string) {
  const res = await page.goto(path, { waitUntil: 'domcontentloaded' });
  expect(res?.status(), `${path}: HTTP status`).toBe(200);
  await expect(page.locator('main')).toBeVisible();
}

async function expectNoHorizontalScroll(page: Page, what: string) {
  // Images and embeds can widen the page after load, so poll until it settles.
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), {
      message: `${what}: page is wider than the screen (px)`,
      timeout: 5_000,
    })
    .toBeLessThanOrEqual(1);
}

// A guest Blocks match asks for a game session on load; the guard refuses it
// like any other write, so only that one is expected.
const GUEST_BLOCKS_SESSION = 'POST /api/games/snapie-blocks/session';

test.afterEach(({ blockedWrites }) => {
  const writes = unexpectedWrites(blockedWrites).filter((w) => w !== GUEST_BLOCKS_SESSION);
  expect(writes, 'unexpected API writes during the test').toEqual([]);
});

test('home feed shows snaps', async ({ page }) => {
  await open(page, '/');
  await expect(page.locator('main article').first()).toBeVisible({ timeout: HIVE_TIMEOUT });
  await expectNoHorizontalScroll(page, 'home');
});

test('a post renders its title and body', async ({ page }) => {
  await open(page, POST.path);
  await expect(page.getByRole('heading', { level: 1, name: POST.title })).toBeVisible({ timeout: HIVE_TIMEOUT });
  await expect(page.locator('main')).toContainText('The buzz is real!', { timeout: HIVE_TIMEOUT });
  await expectNoHorizontalScroll(page, 'post');
});

test('a profile shows the account', async ({ page }) => {
  await open(page, PROFILE.path);
  await expect(page.locator('main')).toContainText(PROFILE.name, { timeout: HIVE_TIMEOUT });
  await expect(page.locator('main')).toContainText(/Followers/i, { timeout: HIVE_TIMEOUT });
  await expectNoHorizontalScroll(page, 'profile');
});

test('explore lists communities', async ({ page }) => {
  await open(page, '/explore');
  await expect(page.locator('main')).toContainText(/Explore/i);
  await expect(page.locator('main')).toContainText(/Trending communities/i, { timeout: HIVE_TIMEOUT });
  await expectNoHorizontalScroll(page, 'explore');
});

const GAMES = [
  { slug: 'puff-quest', name: 'Snapie Quest' },
  { slug: 'snapie-blast', name: 'Snapie Blast' },
  { slug: 'snapie-rush', name: 'Snapie Rush' },
  { slug: 'snapie-blocks', name: 'Snapie Blocks', guest: true },
  { slug: 'snapie-jump', name: 'Snapie Jump' },
  { slug: 'snapie-info-war', name: 'Snapie: Information War' },
];

test('games hub lists every game', async ({ page }) => {
  await open(page, '/games');
  const main = page.locator('main');
  for (const game of GAMES) {
    await expect(main.getByRole('heading', { name: game.name, exact: true }), game.name).toBeVisible();
  }
  // Blocks is open to guests; the other cards open the login prompt instead.
  await expect(main.locator('a[href="/games/snapie-blocks"]')).toBeVisible();
  await expect(main.getByText(/^Log in to play$/)).toHaveCount(GAMES.filter((g) => !g.guest).length);
  await expectNoHorizontalScroll(page, 'games hub');
});

test('gated games ask a guest to log in', async ({ page }) => {
  for (const { slug } of GAMES.filter((g) => !g.guest)) {
    await open(page, `/games/${slug}`);
    await expect(page.locator('main'), slug).toContainText(/log in to play/i);
    await expect(page.locator('main').getByRole('button', { name: /log in/i }).first(), `${slug}: login button`).toBeVisible();
    await expectNoHorizontalScroll(page, slug);
  }
});

test('Snapie Blocks opens for a guest', async ({ page }) => {
  await open(page, '/games/snapie-blocks');
  // The lobby loads for a guest. Starting a match needs the guest session
  // POST, which the write guard refuses, so the match itself isn't covered.
  await expect(page.locator('main')).toContainText(/open to guests/i);
  await expect(page.locator('main').getByRole('button', { name: /quick match/i })).toBeVisible();
  await expectNoHorizontalScroll(page, 'Snapie Blocks');
});
