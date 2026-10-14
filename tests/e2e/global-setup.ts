// Builds the app (debug, frontend embedded), launches it with its own data
// folder and browser profile, and shares how to reach it with the tests.
//
// Environment:
//   E2E_EXE        use this exe instead of building
//   E2E_DATATOOL   DataTool folder to use (else: one the dev app installed,
//                  else the latest release is downloaded into .cache/)
//   E2E_GAME       Overwatch folder (else: common Steam/Battle.net paths);
//                  tests that read game files are skipped without one
//   E2E_KEEP=1     keep the temporary data folder

import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function build(): string {
  const target = join(root, 'src-tauri', 'target', 'e2e');
  console.log('[e2e] Building the app (debug, frontend embedded)…');
  execFileSync('npx', ['tauri', 'build', '--debug', '--no-bundle'], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    // Separate target dir: `tauri dev` uses target/debug and may be running.
    env: { ...process.env, CARGO_TARGET_DIR: target },
  });
  const exe = ['DataToolGUI.exe', 'datatoolgui.exe'].map((n) => join(target, 'debug', n)).find(existsSync);
  if (!exe) throw new Error(`Built exe not found in ${target}`);
  return exe;
}

/** Compare folder names like v2.25.0.0+1151 numerically. */
function versionCompare(a: string, b: string): number {
  const x = (a.match(/\d+/g) ?? []).map(Number);
  const y = (b.match(/\d+/g) ?? []).map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
}

function newestDir(dir: string): string | null {
  if (!existsSync(dir)) return null;
  const dirs = readdirSync(dir)
    .map((n) => join(dir, n))
    .filter((p) => statSync(p).isDirectory() && existsSync(join(p, 'DataTool.exe')))
    .sort((a, b) => versionCompare(b, a));
  return dirs[0] ?? null;
}

async function findDataTool(): Promise<string> {
  if (process.env.E2E_DATATOOL) return process.env.E2E_DATATOOL;
  for (const t of ['debug', 'release']) {
    const found = newestDir(join(root, 'src-tauri', 'target', t, 'datatool'));
    if (found) return found;
  }
  const cache = join(root, '.cache', 'e2e-datatool');
  const cached = newestDir(cache);
  if (cached) return cached;
  console.log('[e2e] Downloading the latest DataTool release…');
  const rel = await (await fetch('https://api.github.com/repos/overtools/OWLib/releases/latest', { headers: { 'User-Agent': 'DataToolGUI-e2e' } })).json();
  const asset = rel.assets.find((a: { name: string }) => a.name === 'toolchain-release.zip');
  const dest = join(cache, rel.tag_name.replace(/[^\w.+-]/g, '_'));
  mkdirSync(dest, { recursive: true });
  const zip = join(cache, 'dt.zip');
  writeFileSync(zip, Buffer.from(await (await fetch(asset.browser_download_url)).arrayBuffer()));
  execFileSync('tar', ['-xf', zip, '-C', dest]);
  rmSync(zip);
  return dest;
}

function findGame(): string {
  if (process.env.E2E_GAME !== undefined) return process.env.E2E_GAME;
  const candidates = [
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Overwatch',
    'C:\\Program Files (x86)\\Overwatch',
    'C:\\Program Files\\Overwatch',
    'D:\\SteamLibrary\\steamapps\\common\\Overwatch',
  ];
  return candidates.find((p) => existsSync(join(p, 'data')) || existsSync(join(p, '.build.info'))) ?? '';
}

function freePort(): Promise<number> {
  return new Promise((res, rej) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => res(port));
    });
    srv.on('error', rej);
  });
}

async function waitForCdp(port: number, child: ChildProcess, log: string, ms = 120_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (child.exitCode !== null) {
      throw new Error(`The app exited with code ${child.exitCode} before opening its debug port.\n${tail(log)}`);
    }
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      if (list.some((t: { type: string }) => t.type === 'page')) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`The app didn't open a debug port on ${port} within ${ms / 1000} s.\n${tail(log)}`);
}

function tail(file: string): string {
  try {
    return `App output:\n${readFileSync(file, 'utf8').split('\n').slice(-40).join('\n')}`;
  } catch {
    return 'No app output.';
  }
}

export default async function globalSetup() {
  const exe = process.env.E2E_EXE ?? build();
  const datatool = await findDataTool();
  const game = findGame();
  const home = mkdtempSync(join(tmpdir(), 'dtg-e2e-'));
  const port = await freePort();

  const log = join(home, 'app.log');
  const out = openSync(log, 'a');
  const child = spawn(exe, [], {
    env: {
      ...process.env,
      DATATOOLGUI_HOME: home,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
      RUST_BACKTRACE: '1',
    },
    stdio: ['ignore', out, out],
  });
  await waitForCdp(port, child, log);

  process.env.E2E_PORT = String(port);
  process.env.E2E_PID = String(child.pid ?? '');
  process.env.E2E_HOME = home;
  process.env.E2E_DATATOOL = datatool;
  process.env.E2E_GAME = game;
  console.log(`[e2e] app ${exe}\n[e2e] home ${home}\n[e2e] DataTool ${datatool}\n[e2e] game ${game || '(none: game tests skipped)'}`);

  return async () => {
    if (child.pid) {
      try {
        execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      } catch {
        // already gone
      }
    }
    if (!process.env.E2E_KEEP) {
      await new Promise((r) => setTimeout(r, 1000));
      rmSync(home, { recursive: true, force: true, maxRetries: 5 });
    }
  };
}
