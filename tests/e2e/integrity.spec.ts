// The app stays whole whatever is clicked: no page scroll, nothing shifted
// or spilling out, no console errors.

import { env, expect, readSettings, test } from './fixtures';

test.describe('regression', () => {
  // Small window: the toggle sits below the fold, as when it was reported.
  test.use({ windowSize: { width: 980, height: 640 } });
  test('"Download damaged files" in Settings keeps the app in view', async ({ app }) => {
    const { page } = app;
    await app.nav('Settings');
    const toggle = page.locator('label.toggle', { hasText: 'Download damaged files' });
    await toggle.scrollIntoViewIfNeeded();
    await app.intact('scrolling to the toggle');
    await toggle.click();
    await app.intact('clicking the toggle');
    await expect(toggle).toBeInViewport();
    await app.waitSaved();
    expect(readSettings().prefs.globalFlags.online).toBe(false);
    // Every toggle on the page, the same way.
    for (const t of await page.locator('main label.toggle:not(.disabled)').all()) {
      await t.scrollIntoViewIfNeeded();
      await t.click();
      await app.intact(`clicking "${(await t.innerText()).trim()}"`);
      await t.click();
    }
  });
});

test('every Settings control can be used without breaking the layout', async ({ app }) => {
  const { page } = app;
  await app.nav('Settings');
  // Show hidden options too, so they're exercised.
  await page.locator('label.toggle', { hasText: 'Show advanced' }).click();
  await app.intact('showing advanced options');

  const toggles = page.locator('main label.toggle:not(.disabled)');
  const n = await toggles.count();
  expect(n).toBeGreaterThan(10);
  for (let i = 0; i < n; i++) {
    const t = toggles.nth(i);
    const label = (await t.innerText()).trim();
    if (/show advanced/i.test(label)) continue;
    const input = t.locator('input');
    const before = await input.isChecked();
    await t.click();
    await expect(input).toBeChecked({ checked: !before });
    await app.intact(`toggling "${label}"`);
    await t.click();
    await expect(input).toBeChecked({ checked: before });
  }

  const selects = page.locator('main select');
  for (let i = 0; i < (await selects.count()); i++) {
    const sel = selects.nth(i);
    const options = await sel.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
    const original = await sel.inputValue();
    for (const v of options.slice(0, 4)) {
      await sel.selectOption(v);
      await app.intact(`choosing "${v}"`);
    }
    await sel.selectOption(original);
  }

  for (const theme of ['Dark', 'Light', 'System']) {
    await page.getByRole('radio', { name: theme, exact: true }).click();
    await app.intact(`theme ${theme}`);
  }
  await expect(page.locator('html')).not.toHaveAttribute('data-theme');
});

test('keyboard focus never scrolls the page', async ({ app }) => {
  const { page } = app;
  for (const where of ['Settings', 'Home'] as const) {
    await app.nav(where);
    for (let i = 0; i < 60; i++) await page.keyboard.press('Tab');
    await app.intact(`tabbing through ${where}`);
  }
});

for (const size of [
  { width: 980, height: 640 },
  { width: 1360, height: 900 },
  { width: 1920, height: 1080 },
]) {
  test.describe(`at ${size.width}x${size.height}`, () => {
    test.use({ windowSize: size });
    test('every page fits the window', async ({ app }) => {
      for (const where of ['Home', 'Jobs', 'Files', 'Settings'] as const) {
        await app.nav(where);
        await app.page.waitForTimeout(200);
        await app.intact(`opening ${where}`);
      }
      await app.openMode('extract-unlocks');
      await app.intact('opening Hero cosmetics');
      await app.openMode('list-heroes');
      await app.intact('opening Heroes');
    });
  });
}

test('long paths and names don\'t push content out of the window', async ({ app }) => {
  const { page } = app;
  const long = `C:\\${'Very Long Folder Name '.repeat(12).trim()}\\Output`;
  await app.openMode('extract-unlocks');
  await page.getByPlaceholder('Where to save the files').fill(long);
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await page.locator('textarea').fill(`${'Someone With An Extraordinarily Long Name '.repeat(3)}|skin=${'A Skin Name That Goes On '.repeat(5)}`);
  await page.locator('textarea').blur();
  await app.intact('entering long values');
  await expect(page.locator('.runbar')).toBeInViewport();
  expect(env.out).toBeTruthy();
});

test.describe('without DataTool', () => {
  test.use({ seed: { prefs: { customCore: '' } } });
  test('mode pages say what is missing instead of "Ready"', async ({ app }) => {
    const { page } = app;
    await app.nav('Home');
    await expect(page.locator('main')).toContainText('Install DataTool');
    await app.openMode('list-heroes');
    await expect(page.locator('.runbar')).toContainText('Install DataTool first');
    await expect(app.runButton()).toBeDisabled();
    await app.intact();
  });
});

test('an unreadable settings file is kept, not overwritten', async ({ app }) => {
  const { page } = app;
  const { readdirSync, writeFileSync } = await import('node:fs');
  const { dirname } = await import('node:path');
  const { settingsPath } = await import('./fixtures');
  await page.goto('about:blank');
  writeFileSync(settingsPath(), '{ "version": 1, "prefs": { broken');
  await page.goBack();
  await expect(page.locator('.toast.error')).toContainText("Settings couldn't be read");
  await app.intact('with the error showing');
  const backups = readdirSync(dirname(settingsPath())).filter((f) => f.startsWith('settings.json.broken-'));
  expect(backups.length).toBe(1);
  app.errors.length = 0; // the failed read is logged on purpose
});

test('the sidebar logo loads and takes the accent colour', async ({ app }) => {
  const { page } = app;
  const logo = page.locator('.side .brand .logo');
  await expect(logo).toBeVisible();
  // A mask that fails to load paints nothing, with no console error to catch.
  const ok = await logo.evaluate(async (el) => {
    const url = getComputedStyle(el).maskImage.match(/url\("?(.*?)"?\)/)?.[1];
    if (!url) return false;
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => {});
    return img.naturalWidth > 0;
  });
  expect(ok).toBe(true);
  const [bg, accent] = await logo.evaluate((el) => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--accent)';
    document.body.append(probe);
    const accent = getComputedStyle(probe).color;
    probe.remove();
    return [getComputedStyle(el).backgroundColor, accent];
  });
  expect(bg).toBe(accent);
});
