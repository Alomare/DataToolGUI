// Hero, unlock and map names for the query builder, read from the game with
// `DataTool util-dynamic-choices` and cached per DataTool build, install and
// language.

import * as backend from './backend';
import { cores } from './core.svelte';
import type { DynamicChoices } from './datatool/choices';
import { parseGameBuild } from './datatool/log';
import { app } from './state.svelte';
import { hash, joinPath } from './util';

/** Flags that change what names DataTool reports. */
const NAME_FLAGS = ['language', 'rcn', 'rkr'];

interface CacheFile {
  key: string;
  loadedAt: number;
  build: string | null;
  data: DynamicChoices;
}

class Choices {
  data = $state.raw<DynamicChoices | null>(null);
  loadedKey = $state('');
  loadedAt = $state(0);
  loading = $state(false);
  error = $state('');
  private pending: Promise<void> | null = null;
  private pendingKey = '';

  /** Cache key for the current DataTool build, game install and language. */
  get key(): string {
    const core = cores.active;
    if (!core || !app.prefs.game) return '';
    const flags = NAME_FLAGS.map((f) => `${f}=${app.prefs.globalFlags[f] ?? ''}`).join(';');
    return hash(`${core.exe}|${cores.activeVersion}|${app.prefs.game.toLowerCase()}|${flags}`);
  }

  get stale(): boolean {
    return !!this.key && this.loadedKey !== this.key;
  }

  private cacheFile(key: string): string {
    return joinPath(app.info!.paths.cache, `choices-${key}.json`);
  }

  /** Load cached names, or read them from the game when `fetch` is set. */
  async ensure(fetch: boolean): Promise<void> {
    const key = this.key;
    if (!key || this.loadedKey === key) return;
    if (this.pending) {
      if (this.pendingKey === key) return this.pending;
      // The language or install changed meanwhile: load for the new key after.
      await this.pending;
      return this.ensure(fetch);
    }
    this.pendingKey = key;
    this.pending = (async () => {
      try {
        const text = await backend.readText(this.cacheFile(key));
        if (text) {
          const cached = JSON.parse(text) as CacheFile;
          if (cached.key === key) {
            this.data = cached.data;
            this.loadedKey = key;
            this.loadedAt = cached.loadedAt;
            return;
          }
        }
      } catch {
        // Corrupt cache: read again from the game.
      }
      if (fetch) await this.readFromGame();
    })().finally(() => (this.pending = null));
    return this.pending;
  }

  async reload() {
    await this.readFromGame();
  }

  private async readFromGame() {
    const core = cores.active;
    const key = this.key;
    if (!core || !key) return;
    this.loading = true;
    this.error = '';
    const out = joinPath(app.info!.paths.cache, `choices-${key}.raw.json`);
    try {
      const args = [app.prefs.game, 'util-dynamic-choices', '--json', `--out=${out}`];
      for (const f of NAME_FLAGS) {
        const v = app.prefs.globalFlags[f];
        if (v === true) args.push(`--${f}`);
        else if (typeof v === 'string' && v) args.push(`--${f}=${v}`);
      }
      const r = await backend.runCapture(core.exe, args);
      const log = `${r.stdout}\n${r.stderr}`;
      const build = log.split('\n').map(parseGameBuild).find(Boolean) ?? null;
      if (build) app.setGameBuild(app.prefs.game, build);
      const text = await backend.readText(out);
      if (!text) {
        const lines = log.split('\n').filter((l) => l.trim());
        const reason = lines.find((l) => /does not support|Error|Exception|not a valid/i.test(l)) ?? lines.slice(-2).join(' ');
        throw new Error(reason || 'DataTool produced no names');
      }
      const data = JSON.parse(text) as DynamicChoices;
      this.data = data;
      this.loadedKey = key;
      this.loadedAt = Date.now();
      const cache: CacheFile = { key, loadedAt: this.loadedAt, build, data };
      await backend.writeText(this.cacheFile(key), JSON.stringify(cache));
      await backend.removeFile(out).catch(() => {});
    } catch (e) {
      this.error = backend.errorText(e);
    } finally {
      this.loading = false;
    }
  }
}

export const choices = new Choices();
