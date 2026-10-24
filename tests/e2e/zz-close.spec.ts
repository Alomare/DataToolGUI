// Closing the window: intercepted while DataTool works, immediate otherwise.
// Runs last (file order): the last test closes the app.

import { execFileSync, spawn } from 'node:child_process';
import { env, expect, readSettings, test } from './fixtures';

const POST_CLOSE = `
  Add-Type -Namespace W -Name U -MemberDefinition '[DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);'
  $h = (Get-Process -Id ${process.env.E2E_PID}).MainWindowHandle
  if ($h -eq 0) { throw 'no window' }`;
const SEND = '[W.U]::PostMessage($h, 0x10, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null';

/** What the window's X button does: post WM_CLOSE to the app's window. */
function requestClose() {
  execFileSync('powershell', ['-NoProfile', '-Command', `${POST_CLOSE}\n${SEND}`]);
}

/**
 * A close that can be fired within milliseconds: PowerShell takes about a
 * second to start, so it starts first and waits for a line on stdin.
 */
async function armClose(): Promise<() => void> {
  const ps = spawn('powershell', ['-NoProfile', '-Command', `${POST_CLOSE}\n'ready'\n[Console]::In.ReadLine() | Out-Null\n${SEND}`], { stdio: ['pipe', 'pipe', 'inherit'] });
  await new Promise<void>((resolve, reject) => {
    ps.stdout.on('data', (d) => String(d).includes('ready') && resolve());
    ps.on('exit', (code) => reject(new Error(`PowerShell exited early (${code})`)));
  });
  return () => ps.stdin.write('\n');
}

test('closing asks first while a job runs', async ({ app }) => {
  test.skip(!env.game, 'needs an Overwatch install to run a job');
  const { page } = app;

  await app.openMode('extract-unlocks');
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await page.locator('textarea').fill('*|skin=*');
  await page.locator('textarea').blur();
  await app.runButton().click();
  await expect(page.locator('.dock .card')).toBeVisible();

  // While running: the close is held for a confirmation, the app stays up.
  requestClose();
  await page.waitForTimeout(2000);
  expect(page.isClosed()).toBe(false);
  await expect(page.locator('.dock .card')).toBeVisible();

  // Stop the job. (The open confirmation is dismissed when the app exits.)
  await page.locator('.dock').getByRole('button', { name: 'Stop' }).click();
  await expect(page.locator('.dock .card')).toHaveCount(0, { timeout: 30_000 });
});

test('closing right after a change closes at once and keeps the change', async ({ app }) => {
  const { page } = app;
  await app.nav('Settings');
  expect(readSettings().prefs.theme).toBe('light');
  const fire = await armClose();

  // Settings are saved a moment after a change; close inside that moment.
  const closed = page.waitForEvent('close', { timeout: 15_000 }).catch(() => null);
  await page.getByRole('group', { name: 'Theme' }).getByRole('radio', { name: 'Dark' }).click();
  fire();
  expect(await closed, 'the window should close when nothing runs').not.toBeNull();
  expect(readSettings().prefs.theme, 'the change made just before closing').toBe('dark');
  app.errors.length = 0; // the page disappears mid-test
});
