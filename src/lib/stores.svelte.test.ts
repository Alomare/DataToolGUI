// The app's stores against a fake backend whose calls resolve when a test
// says so, to pin down what happens when IPC replies arrive out of order.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Call = { cmd: string; args: unknown[]; resolve: (v: unknown) => void; reject: (e: unknown) => void };
const calls: Call[] = [];
const call =
  (cmd: string) =>
  (...args: unknown[]) =>
    new Promise((resolve, reject) => calls.push({ cmd, args, resolve, reject }));

vi.mock('./backend', () => ({
  appInfo: call('appInfo'),
  readText: call('readText'),
  writeText: call('writeText'),
  removeFile: call('removeFile'),
  makeDir: call('makeDir'),
  runCapture: call('runCapture'),
  startJob: call('startJob'),
  stopJob: call('stopJob'),
  pruneDir: call('pruneDir'),
  errorText: (e: unknown) => String(e),
}));
vi.mock('@tauri-apps/plugin-opener', () => ({ openPath: vi.fn() }));

const { app } = await import('./state.svelte');
const { cores } = await import('./core.svelte');
const { choices } = await import('./choices.svelte');
const { queue } = await import('./jobs.svelte');
const { emptyTask } = await import('./datatool/args');
const { buildSchema } = await import('./datatool/schema');

const toolInfo = readFileSync(join(__dirname, 'datatool', 'fixtures', 'toolinfo.json'), 'utf8').replace(/^\uFEFF/, '');

/** Let pending promise callbacks run. */
const settle = () => new Promise((r) => setTimeout(r, 0));

function take(cmd: string, match: (c: Call) => boolean = () => true): Call {
  const i = calls.findIndex((c) => c.cmd === cmd && match(c));
  if (i < 0) throw new Error(`no pending ${cmd} call (pending: ${calls.map((c) => c.cmd).join(', ') || 'none'})`);
  return calls.splice(i, 1)[0];
}

const core = (name: string) => ({ name, dir: `C:\\dt\\${name}`, exe: `C:\\dt\\${name}\\DataTool.exe`, tankview: null, manifest: null, argsFile: null, managed: true });

beforeEach(() => {
  calls.length = 0;
  app.info = { version: '0', os: 'windows', arch: 'x86_64', paths: { root: 'C:\\a', exeDir: 'C:\\a', cores: 'C:\\a\\datatool', data: 'C:\\a\\data', cache: 'C:\\a\\data\\cache', results: 'C:\\a\\data\\results', portable: true } };
  app.prefs.game = 'C:\\Games\\Overwatch';
  app.prefs.customCore = '';
  app.prefs.globalFlags = {};
});

describe('cores.loadSchema', () => {
  it('keeps the schema of the build switched to last when replies arrive out of order', async () => {
    cores.installed = [core('A'), core('B')];
    app.prefs.coreName = 'A';
    const first = cores.loadSchema();
    app.prefs.coreName = 'B';
    const second = cores.loadSchema();

    // B answers first...
    const answer = async (name: string) => {
      for (const c of [take('runCapture', (c) => c.args[0] === core(name).exe), take('runCapture', (c) => c.args[0] === core(name).exe)]) {
        c.resolve({ code: 0, stdout: `DataTool v${name}.0`, stderr: '' });
      }
      await settle();
      take('readText').resolve(toolInfo);
    };
    await answer('B');
    await second;
    expect(cores.version).toBe('B.0');
    // ...then the stale reply for A comes in.
    await answer('A');
    await first;
    expect(cores.version).toBe('B.0');
    expect(cores.loadingSchema).toBe(false);
  });
});

describe('choices.ensure', () => {
  it('loads the names for the current key when the key changed while another load was pending', async () => {
    cores.installed = [core('A')];
    app.prefs.coreName = 'A';
    cores.schema = buildSchema(null);
    choices.loadedKey = '';
    const keyA = choices.key;
    const first = choices.ensure(false);
    app.prefs.globalFlags = { language: 'deDE' };
    const keyB = choices.key;
    expect(keyB).not.toBe(keyA);
    const second = choices.ensure(false);

    const cached = (key: string) => JSON.stringify({ key, loadedAt: 1, build: null, data: { heroes: [] } });
    take('readText', (c) => String(c.args[0]).includes(keyA)).resolve(cached(keyA));
    await first;
    await settle();
    take('readText', (c) => String(c.args[0]).includes(keyB)).resolve(cached(keyB));
    await second;
    expect(choices.loadedKey).toBe(keyB);
  });
});

describe('queue.stop', () => {
  it('stops a job that is stopped while it is still starting', async () => {
    cores.installed = [core('A')];
    app.prefs.coreName = 'A';
    cores.schema = buildSchema(JSON.parse(toolInfo));
    const task = { ...emptyTask('extract-unlocks'), output: 'C:\\out', queries: ['*'] };
    const { job, errors } = queue.addTask(task);
    expect(errors).toEqual([]);
    take('pruneDir').resolve(0);

    // Stop clicked while the output folder is still being created.
    const stopping = queue.stop(job!.id);
    await settle();
    // Nothing is running in the backend yet, so stop_job finds nothing.
    for (const c of calls.filter((c) => c.cmd === 'stopJob')) c.resolve(false);
    calls.splice(0, calls.length, ...calls.filter((c) => c.cmd !== 'stopJob'));
    await stopping;
    take('makeDir').resolve(undefined);
    await settle();
    // If it starts anyway, it must be stopped right away.
    const started = calls.find((c) => c.cmd === 'startJob');
    if (started) {
      started.resolve(1234);
      await settle();
      expect(calls.some((c) => c.cmd === 'stopJob' && c.args[0] === job!.id)).toBe(true);
    }
  });
});

describe('app.flushSave', () => {
  it('writes a pending debounced save immediately', async () => {
    app.loaded = true;
    app.prefs.theme = 'dark';
    app.scheduleSave();
    const flushed = app.flushSave();
    const w = take('writeText');
    expect(JSON.parse(String(w.args[1])).prefs.theme).toBe('dark');
    w.resolve(undefined);
    await flushed;
    // The debounced write doesn't happen a second time.
    await new Promise((r) => setTimeout(r, 450));
    expect(calls.some((c) => c.cmd === 'writeText')).toBe(false);
  });
});
