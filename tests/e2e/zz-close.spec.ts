// Closing the window: intercepted while DataTool works, immediate otherwise.
// Runs last (file order): it closes the app.

import { execFileSync } from 'node:child_process';
import { env, expect, test } from './fixtures';

test('closing asks first while a job runs, and closes right away when idle', async ({ app }) => {
  test.skip(!env.game, 'needs an Overwatch install to run a job');
  const { page } = app;
  // What the window's X button does: post WM_CLOSE to the app's window.
  const requestClose = async () => {
    const script = `
      Add-Type -Namespace W -Name U -MemberDefinition '[DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);'
      $h = (Get-Process -Id ${process.env.E2E_PID}).MainWindowHandle
      if ($h -eq 0) { throw 'no window' }
      [W.U]::PostMessage($h, 0x10, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null`;
    execFileSync('powershell', ['-NoProfile', '-Command', script]);
  };

  await app.openMode('extract-unlocks');
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await page.locator('textarea').fill('*|skin=*');
  await page.locator('textarea').blur();
  await app.runButton().click();
  await expect(page.locator('.dock .card')).toBeVisible();

  // While running: the close is held for a confirmation, the app stays up.
  await requestClose();
  await page.waitForTimeout(2000);
  expect(page.isClosed()).toBe(false);
  await expect(page.locator('.dock .card')).toBeVisible();

  // Stop the job; now a close goes through. (The open confirmation is
  // dismissed when the app exits.)
  await page.locator('.dock').getByRole('button', { name: 'Stop' }).click();
  await expect(page.locator('.dock .card')).toHaveCount(0, { timeout: 30_000 });
  const closed = page.waitForEvent('close', { timeout: 15_000 }).catch(() => null);
  await requestClose();
  expect(await closed, 'the window should close when nothing runs').not.toBeNull();
  app.errors.length = 0; // the page disappears mid-test
});
