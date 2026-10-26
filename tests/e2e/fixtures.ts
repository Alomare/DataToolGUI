// Shared test fixtures: a connection to the running app, a known starting
// state for every test, and layout integrity checks.

import { test as base, chromium, expect, type Browser, type Locator, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const env = {
  get home() {
    return process.env.E2E_HOME!;
  },
  get datatool() {
    return process.env.E2E_DATATOOL ?? '';
  },
  get game() {
    return process.env.E2E_GAME ?? '';
  },
  get out() {
    return join(process.env.E2E_HOME!, 'out');
  },
};

export type Prefs = Record<string, unknown>;

/** Settings every test starts from: DataTool and the game set up, no network. */
export function defaultSeed(): { prefs: Prefs; tasks: Record<string, unknown>; presets: unknown[]; history: unknown[] } {
  return {
    prefs: {
      theme: 'light',
      game: env.game,
      games: env.game ? [{ path: env.game, launcher: 'steam', build: null, label: 'Test game' }] : [],
      outputDir: env.out,
      coreName: '',
      customCore: env.datatool,
      checkUpdates: false,
      autoInstall: false,
      keepCores: 3,
      globalFlags: {},
      autoLoadChoices: false,
      openWhenDone: false,
      lastUpdateCheck: Date.now(),
      skippedRelease: '',
    },
    tasks: {},
    presets: [],
    history: [],
  };
}

export function settingsPath() {
  return join(env.home, 'data', 'settings.json');
}

export function readSettings() {
  return JSON.parse(readFileSync(settingsPath(), 'utf8'));
}

// ---------------------------------------------------------------------------
// Integrity: the app fills the window, nothing scrolled the page itself, and
// nothing spills out sideways. Run after interactions.

export interface Integrity {
  problems: string[];
}

export async function checkIntegrity(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const html = document.documentElement;
    if (html.scrollTop || html.scrollLeft) problems.push(`page scrolled (html ${html.scrollLeft},${html.scrollTop})`);
    if (document.body.scrollTop || document.body.scrollLeft) problems.push(`page scrolled (body ${document.body.scrollLeft},${document.body.scrollTop})`);
    const app = document.querySelector('.app');
    if (!app) return ['.app is missing'];
    const r = app.getBoundingClientRect();
    if (Math.abs(r.top) > 1 || Math.abs(r.left) > 1) problems.push(`app shifted to (${r.left}, ${r.top})`);
    if (Math.abs(r.width - vw) > 1 || Math.abs(r.height - vh) > 1) problems.push(`app is ${r.width}x${r.height}, window ${vw}x${vh}`);
    if (html.scrollWidth > vw + 1) problems.push(`page wider than the window (${html.scrollWidth} > ${vw})`);
    const main = document.querySelector('main');
    if (!main) problems.push('main is missing');
    else {
      const m = main.getBoundingClientRect();
      if (m.height < 200 || m.width < 300) problems.push(`main is only ${m.width}x${m.height}`);
      if (!(main as HTMLElement).innerText.trim()) problems.push('main is empty');
      if (main.scrollWidth > main.clientWidth + 1) problems.push(`main scrolls sideways (${main.scrollWidth} > ${main.clientWidth})`);
      // Content spilling out of visible-overflow boxes (e.g. a badge pushed
      // past its column).
      const describe = (el: Element) => {
        const cls = [...el.classList].filter((c) => !c.startsWith('svelte-')).join('.');
        return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}${el.getAttribute('data-flag') ? `[data-flag=${el.getAttribute('data-flag')}]` : ''}`;
      };
      for (const el of main.querySelectorAll<HTMLElement>('.flag, .panel, .card, .item, .row, header, .stat, .tile')) {
        const style = getComputedStyle(el);
        if (style.overflowX !== 'visible' || !el.clientWidth) continue;
        if (el.scrollWidth > el.clientWidth + 8) problems.push(`${describe(el)} overflows by ${el.scrollWidth - el.clientWidth}px: "${el.innerText.slice(0, 60).replace(/\s+/g, ' ')}"`);
      }
    }
    // Notifications must not cover the main actions.
    const toast = document.querySelector('.toast');
    if (toast) {
      const t = toast.getBoundingClientRect();
      for (const b of document.querySelectorAll('.runbar button, .dock button')) {
        const r = b.getBoundingClientRect();
        if (r.width && t.left < r.right && t.right > r.left && t.top < r.bottom && t.bottom > r.top) problems.push(`notification covers "${(b as HTMLElement).innerText.trim()}"`);
      }
    }
    const side = document.querySelector('.side');
    if (!side || side.getBoundingClientRect().width < 150) problems.push('sidebar missing or collapsed');
    return problems;
  });
}

// ---------------------------------------------------------------------------

export class App {
  readonly errors: string[] = [];
  constructor(readonly page: Page) {}

  /** Fail with a readable list if the layout broke. */
  async intact(context = '') {
    const problems = await checkIntegrity(this.page);
    expect(problems, `layout integrity${context ? ` after ${context}` : ''}`).toEqual([]);
  }

  nav(name: 'Home' | 'Jobs' | 'Files' | 'Settings') {
    return this.page.locator('nav button.nav', { hasText: name }).click();
  }

  async openMode(keyword: string) {
    const search = this.page.getByPlaceholder('Find a mode');
    await search.fill(keyword);
    await this.page.locator(`button.mode[data-mode="${keyword}"]`).click();
    await expect(this.page.locator('.mode .crumbs')).toContainText(keyword);
    await search.fill('');
  }

  command(): Promise<string> {
    return this.page.locator('.cmd').innerText();
  }

  runButton(): Locator {
    return this.page.locator('.runbar button.primary');
  }

  flag(name: string): Locator {
    return this.page.locator(`[data-flag="${name}"]`).first();
  }

  /** Open every collapsed options section. */
  async expandOptions() {
    const collapsed = this.page.locator('.sec-head[aria-expanded="false"]');
    while (await collapsed.count()) await collapsed.first().click();
  }

  async waitSaved() {
    // Settings are saved 400 ms after the last change.
    await this.page.waitForTimeout(700);
  }
}

type Fixtures = { seed: Partial<ReturnType<typeof defaultSeed>> & { prefs?: Prefs }; app: App; windowSize: { width: number; height: number } | null };

export const test = base.extend<Fixtures, { cdp: Browser; appUrl: string }>({
  cdp: [
    async ({}, use) => {
      const browser = await chromium.connectOverCDP(`http://127.0.0.1:${process.env.E2E_PORT}`);
      await use(browser);
      await browser.close().catch(() => {});
    },
    { scope: 'worker' },
  ],
  appUrl: [
    async ({ cdp }, use) => {
      const page = cdp.contexts()[0].pages()[0];
      await page.waitForLoadState();
      await use(new URL(page.url()).origin + '/');
    },
    { scope: 'worker' },
  ],
  seed: [{}, { option: true }],
  windowSize: [null, { option: true }],

  app: async ({ cdp, appUrl, seed, windowSize }, use, testInfo) => {
    const page = cdp.contexts()[0].pages()[0];
    // Leave the app first so a pending settings save can't land after the seed.
    await page.goto('about:blank');
    const s = defaultSeed();
    const merged = { version: 1, ...s, ...seed, prefs: { ...s.prefs, ...(seed.prefs ?? {}) } };
    mkdirSync(join(env.home, 'data'), { recursive: true });
    mkdirSync(env.out, { recursive: true });
    writeFileSync(settingsPath(), JSON.stringify(merged, null, 2));

    if (windowSize) await page.setViewportSize(windowSize);
    const app = new App(page);
    const onConsole = (m: import('@playwright/test').ConsoleMessage) => {
      if (m.type() === 'error') app.errors.push(m.text());
    };
    const onError = (e: Error) => app.errors.push(`${e.name}: ${e.message}`);
    page.on('console', onConsole);
    page.on('pageerror', onError);

    await page.goto(appUrl);
    await expect(page.locator('.side')).toBeVisible();
    await expect(page.locator('main')).not.toContainText('Loading…', { timeout: 30_000 });

    await use(app);

    page.off('console', onConsole);
    page.off('pageerror', onError);
    if (testInfo.status !== testInfo.expectedStatus) {
      await testInfo.attach('screenshot', { body: await page.screenshot(), contentType: 'image/png' });
    }
    if (windowSize) {
      // Back to the real window size.
      const cdpSession = await page.context().newCDPSession(page);
      await cdpSession.send('Emulation.clearDeviceMetricsOverride').catch(() => {});
      await cdpSession.detach().catch(() => {});
    }
    expect(app.errors, 'console errors').toEqual([]);
  },
});

export { expect };
