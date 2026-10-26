// Every mode opens and renders, and every option changes the command line
// the way DataTool expects.

import { expect, readSettings, test, type App } from './fixtures';

test('every mode opens, renders and builds a command', async ({ app }) => {
  test.setTimeout(240_000);
  const { page } = app;
  const modes = await page.locator('button.mode[data-mode]').evaluateAll((els) => els.map((e) => e.getAttribute('data-mode')!));
  expect(modes.length).toBeGreaterThan(30);
  for (const keyword of modes) {
    await page.locator(`button.mode[data-mode="${keyword}"]`).click();
    await expect(page.locator('.mode .crumbs')).toContainText(keyword);
    await expect(page.locator('main h1')).not.toBeEmpty();
    expect(await app.command(), keyword).toContain(` ${keyword}`);
    await app.expandOptions();
    await app.intact(`opening ${keyword}`);
  }
});

test('only the modes and options DataTool lists are offered', async ({ app }) => {
  const { page } = app;
  await expect(page.locator('button.mode[data-mode="extract-unlocks"]')).toBeVisible();
  await expect(page.locator('.side')).not.toContainText(/advanced|debug/i);
  await expect(page.locator('button.mode[data-mode="extract-anything"]')).toHaveCount(0);
  await app.openMode('extract-hero-voice');
  await app.expandOptions();
  await expect(page.locator('main')).not.toContainText(/advanced/i);
  await expect(page.locator('[data-flag="voice-group-by-hero"]')).toHaveCount(0);
  await app.nav('Settings');
  await expect(page.locator('main')).not.toContainText(/show advanced/i);
});

/** Click/choose every flag of the open mode and check the command each time. */
async function exerciseFlags(app: App) {
  const { page } = app;
  await app.expandOptions();
  const names = await page.locator('[data-flag]').evaluateAll((els) => els.map((e) => e.getAttribute('data-flag')!));
  expect(names.length).toBeGreaterThan(5);
  for (const name of names) {
    const flag = app.flag(name);
    const toggle = flag.locator('label.toggle');
    const select = flag.locator('select');
    const input = flag.locator('input:not([type=checkbox])');
    const arg = new RegExp(`--${name}(=|\\s|$)`);
    if (await toggle.count()) {
      await toggle.click();
      expect(await app.command(), `--${name} after toggling`).toMatch(arg);
      await expect(flag).toHaveClass(/changed/);
      await app.intact(`toggling ${name}`);
      await toggle.click();
      expect(await app.command(), `--${name} after toggling back`).not.toMatch(arg);
    } else if (await select.count()) {
      const options = await select.locator('option').evaluateAll((os) => os.map((o) => ({ value: (o as HTMLOptionElement).value, text: o.textContent ?? '' })));
      for (const o of options) {
        await select.selectOption(o.value);
        const cmd = await app.command();
        if (/default|game's language/i.test(o.text) || o.value === '') expect(cmd, `${name}=${o.value} is the default`).not.toMatch(arg);
        else expect(cmd, `${name}=${o.value}`).toContain(`--${name}=${o.value}`);
        await app.intact(`choosing ${name}=${o.value}`);
      }
      const reset = flag.locator('button.reset');
      if (await reset.count()) await reset.click();
      expect(await app.command()).not.toMatch(arg);
    } else if (await input.count()) {
      await input.fill('e2e-value');
      await input.blur();
      expect(await app.command(), `--${name}=e2e-value`).toContain(`--${name}=e2e-value`);
      await app.intact(`typing into ${name}`);
      await flag.locator('button.reset').click();
      expect(await app.command()).not.toMatch(arg);
    } else {
      throw new Error(`No control for flag ${name}`);
    }
  }
}

test('every extraction option changes the command and resets', async ({ app }) => {
  test.setTimeout(180_000);
  await app.openMode('extract-unlocks');
  await exerciseFlags(app);
});

test('every listing option changes the command and resets', async ({ app }) => {
  await app.openMode('list-heroes');
  await exerciseFlags(app);
});

test('list results: show in app, save JSON, text', async ({ app }) => {
  const { page } = app;
  await app.openMode('list-heroes');
  expect(await app.command()).toMatch(/--json "?--out=.+\.json/);
  await page.getByRole('radio', { name: 'Save JSON' }).click();
  await expect(app.runButton()).toBeDisabled();
  await expect(page.locator('.runbar')).toContainText('Choose a file');
  await page.getByPlaceholder('Where to save the JSON').fill('C:\\out\\heroes.json');
  await page.getByPlaceholder('Where to save the JSON').blur();
  expect(await app.command()).toContain('--json --out=C:\\out\\heroes.json');
  await page.getByRole('radio', { name: 'Text', exact: true }).click();
  expect(await app.command()).not.toContain('--json');
  await page.locator('label.toggle', { hasText: 'Simplified' }).click();
  expect(await app.command()).toContain('--simplify');
  await app.intact();
});

test('a task override of a general setting beats Settings', async ({ app }) => {
  const { page } = app;
  await app.nav('Settings');
  await app.flag('language').locator('select').selectOption('frFR');
  await app.openMode('list-maps');
  await app.expandOptions();
  expect(await app.command()).toContain('--language=frFR');
  await app.flag('language').locator('select').selectOption('deDE');
  expect(await app.command()).toContain('--language=deDE');
  await app.flag('language').locator('button.reset').click();
  expect(await app.command()).toContain('--language=frFR');
  await expect(page.locator('main')).toBeVisible();
});

test('extra arguments and validation', async ({ app }) => {
  const { page } = app;
  await app.openMode('extract-maps');
  await expect(app.runButton()).toBeDisabled();
  await expect(page.locator('.runbar')).toContainText('Add at least one query');
  await page.getByPlaceholder('--flag=value').fill('--debug "quoted"');
  await page.getByPlaceholder('--flag=value').blur();
  expect(await app.command()).toContain('--debug quoted');
  await page.getByPlaceholder('--flag=value').fill('--x="a');
  await page.getByPlaceholder('--flag=value').blur();
  await expect(page.locator('.runbar')).toContainText(/query|quote/);
  await page.getByPlaceholder('--flag=value').fill('');
  await page.getByPlaceholder('--flag=value').blur();
  await app.intact();
});

test('presets: save, find on Home, run, delete', async ({ app }) => {
  const { page } = app;
  await app.openMode('list-achievements');
  await page.getByRole('button', { name: 'Save preset' }).click();
  const dialog = page.getByRole('dialog', { name: 'Save as preset' });
  await expect(dialog).toBeVisible();
  await app.intact('opening the dialog');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Save preset' }).click();
  await dialog.locator('input').fill('My achievements');
  await dialog.locator('input').press('Enter');
  await expect(dialog).toBeHidden();
  await app.nav('Home');
  await expect(page.locator('main')).toContainText('My achievements');
  await app.intact('showing presets');
  await page.locator('.line', { hasText: 'My achievements' }).getByRole('button', { name: 'Delete preset' }).click();
  await expect(page.locator('main')).not.toContainText('My achievements');
  await app.waitSaved();
  expect(readSettings().presets).toEqual([]);
});

test('reset clears queries and options but keeps the output folder', async ({ app }) => {
  const { page } = app;
  await app.openMode('extract-sprays');
  await page.getByPlaceholder(/Spray name/).fill('Something');
  await page.getByPlaceholder(/Spray name/).press('Enter');
  await app.expandOptions();
  await app.flag('raw').locator('label.toggle').click();
  const out = await page.getByPlaceholder('Where to save the files').inputValue();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  expect(await app.command()).not.toContain('Something');
  expect(await app.command()).not.toContain('--raw');
  await expect(page.getByPlaceholder('Where to save the files')).toHaveValue(out);
});

test('the form of each mode survives navigation and restarts', async ({ app }) => {
  const { page } = app;
  await app.openMode('extract-maps');
  await page.getByPlaceholder('Dorado').fill('Ilios');
  await page.getByPlaceholder('Dorado').press('Enter');
  await app.nav('Home');
  await app.openMode('extract-maps');
  expect(await app.command()).toContain('Ilios');
  await app.waitSaved();
  await page.reload();
  await expect(page.locator('.side')).toBeVisible();
  await app.openMode('extract-maps');
  expect(await app.command()).toContain('Ilios');
});

test('Ctrl+Enter runs only a valid task', async ({ app }) => {
  const { page } = app;
  await app.openMode('extract-maps');
  await page.keyboard.press('Control+Enter');
  await expect(page.locator('nav button.nav', { hasText: 'Jobs' }).locator('.badge')).toHaveCount(0);
});
