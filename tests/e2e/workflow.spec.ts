// Real DataTool runs against the game: listing, extracting, browsing the
// result, stopping, and recovering from mistakes.

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { env, expect, test } from './fixtures';

test.skip(() => !env.game, 'needs an Overwatch install');
test.setTimeout(240_000);

async function waitForJob(page: import('@playwright/test').Page, statuses = /done|failed|cancelled/) {
  await expect(page.locator('.detail .head .badge').first()).toHaveText(statuses, { timeout: 180_000 });
}

test('list heroes and browse the result', async ({ app }) => {
  const { page } = app;
  await app.openMode('list-heroes');
  await app.runButton().click();
  await app.nav('Jobs');
  await waitForJob(page);
  await expect(page.locator('.detail .head .badge').first()).toHaveText('done');
  await expect(page.locator('.results')).toBeVisible();
  const rows = page.locator('.results tbody tr');
  expect(await rows.count()).toBeGreaterThan(50);
  await page.locator('.results input[type=search]').fill('Tracer');
  await expect(rows.first()).toContainText('Tracer');
  await rows.first().click();
  await expect(page.locator('.results .detail')).toContainText('Tracer');
  await app.intact('selecting a row');
  for (const v of ['Tree', 'Raw', 'Table']) {
    await page.locator('.results .seg button', { hasText: v }).click();
    await app.intact(`${v} view`);
  }
  await page.locator('.tabs button', { hasText: 'Log' }).click();
  await expect(page.locator('.log')).toContainText('Execution finished');
});

test('extract a skin, then browse and preview the files', async ({ app }) => {
  const { page } = app;
  await app.openMode('extract-unlocks');
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await page.locator('textarea').fill('Tracer|skin=Overwatch Classic');
  await page.locator('textarea').blur();
  await app.runButton().click();
  // The dock shows progress while it runs.
  await expect(page.locator('.dock .card')).toBeVisible();
  await app.intact('with the job dock open');
  await app.nav('Jobs');
  await waitForJob(page);
  await expect(page.locator('.detail .head .badge').first()).toHaveText('done');
  const head = await page.locator('.detail .head').innerText();
  const files = Number(/([\d,]+) files/.exec(head)?.[1].replace(/,/g, ''));
  expect(files).toBeGreaterThan(500);
  expect(existsSync(join(env.out, 'Heroes', 'Tracer', 'GUI'))).toBe(true);

  await page.getByRole('button', { name: 'Browse' }).click();
  await expect(page.locator('.files .crumbs')).toContainText('out');
  for (const name of ['Heroes', 'Tracer', 'GUI']) await page.locator('.entry', { hasText: name }).first().click();
  await expect(page.locator('.listing')).toHaveClass(/grid/);
  const firstImage = readdirSync(join(env.out, 'Heroes', 'Tracer', 'GUI'))[0];
  await page.locator('.entry', { hasText: firstImage }).click();
  const img = page.locator('.pv-body img');
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((i) => (i as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await app.intact('previewing an image');
  await page.getByRole('button', { name: 'Up' }).click();
  await expect(page.locator('.files .crumbs')).not.toContainText('GUI');
});

test('a running job can be stopped', async ({ app }) => {
  const { page } = app;
  await app.openMode('extract-unlocks');
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await page.locator('textarea').fill('*|skin=*');
  await page.locator('textarea').blur();
  await app.runButton().click();
  await app.nav('Jobs');
  await expect(page.locator('.detail .live')).toBeVisible();
  await page.waitForTimeout(3000);
  await page.locator('.detail .head').getByRole('button', { name: 'Stop' }).click();
  await waitForJob(page);
  await expect(page.locator('.detail .head .badge').first()).toHaveText('cancelled');
  await app.intact('after stopping');
});

test('a misspelled name gets DataTool\'s suggestion as a one-click fix', async ({ app }) => {
  const { page } = app;
  await app.openMode('extract-unlocks');
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await page.locator('textarea').fill('Tracer|skin=Overwatch Clasic');
  await page.locator('textarea').blur();
  await app.runButton().click();
  await app.nav('Jobs');
  await waitForJob(page);
  const notice = page.locator('.detail .notice', { hasText: 'Nothing matched' });
  await expect(notice).toContainText('Tracer|skin=Overwatch Classic');
  await notice.getByRole('button', { name: 'Use it' }).click();
  await expect(page.locator('.mode .crumbs')).toContainText('extract-unlocks');
  expect(await app.command()).toContain('"Tracer|skin=Overwatch Classic"');
});

test.describe('with a wrong game folder', () => {
  test.use({ seed: { prefs: { game: 'C:\\Windows', games: [{ path: 'C:\\Windows', launcher: 'unknown', build: null, label: 'Wrong' }] } } });
  test('the failure is reported, not hidden', async ({ app }) => {
    const { page } = app;
    await app.openMode('list-heroes');
    await app.runButton().click();
    await app.nav('Jobs');
    await waitForJob(page);
    await expect(page.locator('.detail .head .badge').first()).toHaveText('failed');
    await expect(page.locator('.detail .notice').first()).toBeVisible();
    await app.intact('showing the failure');
  });
});
