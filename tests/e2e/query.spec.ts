// The query builder produces DataTool's query syntax, round-trips through
// text, and refuses queries DataTool would reject.

import { env, expect, test } from './fixtures';

test('builder: hero, type, items, exclusions and tags', async ({ app }) => {
  const { page } = app;
  await app.openMode('extract-unlocks');
  await page.getByRole('button', { name: 'Add query' }).click();
  expect(await app.command()).toContain('"*|skin=*"');

  const from = page.locator('.qb .target');
  await from.locator('.chip button').click(); // remove "*"
  await expect(page.locator('.runbar')).toContainText('Choose who or what');
  await expect(app.runButton()).toBeDisabled();
  await from.locator('input').fill('Tracer');
  await from.locator('input').press('Enter');

  const part = page.locator('.qb .part').first();
  await part.getByPlaceholder(/Pick skins|Names, or leave/).fill('Overwatch Classic');
  await part.getByPlaceholder(/Pick skins|Names, or leave/).press('Enter');
  await part.getByPlaceholder('Names to skip').fill('Default');
  await part.getByPlaceholder('Names to skip').press('Enter');
  await part.getByPlaceholder(/Any rarity/).fill('legendary');
  await part.getByPlaceholder(/Any rarity/).press('Enter');
  expect(await app.command()).toContain('"Tracer|skin=(rarity=legendary),Overwatch Classic,!Default"');
  await app.intact('building a query');

  // A second type, then remove the first.
  await page.getByRole('button', { name: 'Add a type' }).click();
  await page.locator('.qb .part').nth(1).locator('select').selectOption('emote');
  expect(await app.command()).toContain('|emote=*"');
  await part.getByRole('button', { name: 'Remove type' }).click();
  expect(await app.command()).toContain('"Tracer|emote=*"');
  await expect(app.runButton()).toBeEnabled();

  await page.getByRole('button', { name: 'Remove query' }).click();
  await expect(app.runButton()).toBeDisabled();
  await app.intact('removing the query');
});

test('text mode round-trips with the builder', async ({ app }) => {
  const { page } = app;
  await app.openMode('extract-unlocks');
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await page.locator('textarea').fill('Mercy|skin=(rarity=legendary,event=halloween),!Witch\nReaper|spray=*');
  await page.locator('textarea').blur();
  await expect(page.locator('.qb')).toHaveCount(2);
  await expect(page.locator('.qb').first().locator('.chip.exclude')).toContainText('Witch');
  await expect(page.locator('.qb').first().locator('.chip.tag')).toHaveCount(2);
  const cmd = await app.command();
  expect(cmd).toContain('"Mercy|skin=(rarity=legendary,event=halloween),!Witch"');
  expect(cmd).toContain('"Reaper|spray=*"');
  await app.intact();
});

test('invalid queries are explained and block running', async ({ app }) => {
  const { page } = app;
  await app.openMode('extract-unlocks');
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  for (const [q, msg] of [
    ['Tracer|skn=x', 'Unknown type'],
    ['Tracer|skin', 'needs a "="'],
    ['Tracer|skin=(rarity=epic', 'parentheses'],
    ['|skin=*', 'Choose who'],
  ]) {
    await page.locator('textarea').fill(q);
    await page.locator('textarea').blur();
    await expect(page.locator('.panel .notice.danger')).toContainText(msg);
    await expect(app.runButton()).toBeDisabled();
    await page.getByRole('button', { name: 'Text', exact: true }).click();
  }
});

test('name-only modes use one picker; examples add queries', async ({ app }) => {
  const { page } = app;
  await app.openMode('extract-maps');
  const picker = page.getByPlaceholder('Dorado');
  await picker.fill('Dorado');
  await picker.press('Enter');
  await page.locator('.picker input').fill('*');
  await page.locator('.picker input').press('Enter');
  const cmd = await app.command();
  expect(cmd).toContain(' Dorado ');
  expect(cmd).toContain(' "*"');
  await page.locator('.picker .chip', { hasText: 'Dorado' }).getByRole('button').click();
  expect(await app.command()).not.toContain('Dorado');
  await page.locator('.examples .ex', { hasText: "King's Row" }).click();
  expect(await app.command()).toContain(`"King's Row"`);
  await app.intact();
});

test('names with characters DataTool can\'t match are flagged', async ({ app }) => {
  const { page } = app;
  await app.openMode('extract-sprays');
  const picker = page.getByPlaceholder(/Spray name/);
  await picker.fill('Hello, World');
  await picker.press('Enter');
  await expect(page.locator('.chip.bad')).toHaveCount(0); // commas are fine as a whole target
  await page.locator('.picker input').fill('Say "hi"');
  await page.locator('.picker input').press('Enter');
  await expect(page.locator('.chip.bad')).toHaveCount(1);
  await expect(app.runButton()).toBeDisabled();
});

test('names load from the game and fill the pickers', async ({ app }) => {
  test.skip(!env.game, 'needs an Overwatch install');
  test.setTimeout(120_000);
  const { page } = app;
  await app.openMode('extract-unlocks');
  await page.getByRole('button', { name: 'Load names from the game' }).click();
  await expect(page.locator('main')).toContainText('Names from', { timeout: 90_000 });
  await page.getByRole('button', { name: 'Add query' }).click();
  const from = page.locator('.qb .target');
  await from.locator('.chip button').click();
  await from.locator('input').fill('Trac');
  await expect(page.getByRole('option', { name: 'Tracer', exact: true })).toBeVisible();
  await page.keyboard.press('Enter');
  const part = page.locator('.qb .part').first();
  await part.locator('input').first().fill('Overwatch Cla');
  await expect(page.getByRole('option', { name: 'Overwatch Classic', exact: true })).toBeVisible();
  await page.keyboard.press('Enter');
  expect(await app.command()).toContain('"Tracer|skin=Overwatch Classic"');
  await app.intact('picking from game names');
});
