// App-wide state: preferences, game installs, per-mode forms, presets and
// history. Persisted as JSON in the portable data folder.

import * as backend from './backend';
import type { AppInfo, GameInstall } from './backend';
import { emptyTask, type FlagValue, type TaskForm } from './datatool/args';
import { clone, joinPath, uid } from './util';

export type Theme = 'system' | 'light' | 'dark';
export type Page = 'home' | 'mode' | 'jobs' | 'files' | 'settings';

export interface SavedGame {
  path: string;
  launcher: GameInstall['launcher'];
  /** Last game build seen in DataTool's log or .build.info, e.g. 2.25.0.0.154088. */
  build: string | null;
  label: string;
}

export interface Prefs {
  theme: Theme;
  /** Selected Overwatch install. */
  game: string;
  games: SavedGame[];
  /** Default output folder for extract modes. */
  outputDir: string;
  /** Installed DataTool folder name under datatool/ ('' = newest). */
  coreName: string;
  /** A DataTool folder of the user's own; overrides installed ones when set. */
  customCore: string;
  checkUpdates: boolean;
  /** Install new DataTool releases without asking. */
  autoInstall: boolean;
  /** How many installed DataTool versions to keep (older ones are removed after an update). */
  keepCores: number;
  /** Show debug modes and hidden flags. */
  showAdvanced: boolean;
  /** General DataTool flags applied to every run (language, region...). */
  globalFlags: Record<string, FlagValue>;
  /** Read hero/unlock/map names from the game when a query mode is opened. */
  autoLoadChoices: boolean;
  /** Open the output folder when an extraction finishes. */
  openWhenDone: boolean;
  lastUpdateCheck: number;
  /** Release the user chose to skip. */
  skippedRelease: string;
}

export interface Preset {
  id: string;
  name: string;
  task: TaskForm;
  createdAt: number;
}

export interface HistoryEntry {
  id: string;
  at: number;
  task: TaskForm;
  status: 'done' | 'failed' | 'cancelled';
}

function defaultPrefs(): Prefs {
  return {
    theme: 'system',
    game: '',
    games: [],
    outputDir: '',
    coreName: '',
    customCore: '',
    checkUpdates: true,
    autoInstall: false,
    keepCores: 3,
    showAdvanced: false,
    globalFlags: {},
    autoLoadChoices: true,
    openWhenDone: false,
    lastUpdateCheck: 0,
    skippedRelease: '',
  };
}

interface SavedFile {
  version: 1;
  prefs: Prefs;
  tasks: Record<string, TaskForm>;
  presets: Preset[];
  history: HistoryEntry[];
}

const HISTORY_LIMIT = 60;

class AppState {
  info = $state<AppInfo | null>(null);
  page = $state<Page>('home');
  /** Mode shown on the mode page. */
  mode = $state('');
  prefs = $state<Prefs>(defaultPrefs());
  /** The form of each mode, kept across navigation and restarts. */
  tasks = $state<Record<string, TaskForm>>({});
  presets = $state<Preset[]>([]);
  history = $state<HistoryEntry[]>([]);
  /** Folder the file browser shows. */
  browsePath = $state('');
  /** Job whose details are open on the jobs page. */
  selectedJob = $state('');

  toast = $state<{ id: number; text: string; kind: 'info' | 'error' | 'success'; action?: { label: string; run: () => void } } | null>(null);

  loaded = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  get settingsPath(): string {
    return this.info ? joinPath(this.info.paths.data, 'settings.json') : '';
  }

  get game(): SavedGame | null {
    return this.prefs.games.find((g) => g.path === this.prefs.game) ?? null;
  }

  async load() {
    this.info = await backend.appInfo();
    try {
      const text = await backend.readText(this.settingsPath);
      if (text) {
        const saved = JSON.parse(text) as Partial<SavedFile>;
        this.prefs = { ...defaultPrefs(), ...(saved.prefs ?? {}) };
        this.tasks = Object.fromEntries(Object.entries(saved.tasks ?? {}).map(([k, t]) => [k, { ...emptyTask(k), ...t }]));
        this.presets = (saved.presets ?? []).map((p) => ({ ...p, task: { ...emptyTask(p.task.mode), ...p.task } }));
        this.history = saved.history ?? [];
      }
    } catch (e) {
      this.notify(`Settings couldn't be read, starting fresh (${backend.errorText(e)})`, 'error');
    }
    this.loaded = true;
  }

  /** Debounced save; called from an $effect watching the persisted state. */
  scheduleSave() {
    if (!this.loaded) return;
    const snapshot: SavedFile = {
      version: 1,
      prefs: clone(this.prefs),
      tasks: clone(this.tasks),
      presets: clone(this.presets),
      history: clone(this.history),
    };
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      backend.writeText(this.settingsPath, JSON.stringify(snapshot, null, 2)).catch((e) => {
        this.notify(`Couldn't save settings: ${backend.errorText(e)}`, 'error');
      });
    }, 400);
  }

  task(mode: string): TaskForm {
    if (!this.tasks[mode]) this.tasks[mode] = emptyTask(mode);
    return this.tasks[mode];
  }

  openMode(mode: string, task?: TaskForm) {
    if (task) this.tasks[mode] = { ...emptyTask(mode), ...clone(task), mode };
    this.mode = mode;
    this.page = 'mode';
  }

  // --- Game installs ---------------------------------------------------------

  addGame(install: GameInstall, select = true) {
    const existing = this.prefs.games.find((g) => g.path.toLowerCase() === install.path.toLowerCase());
    if (existing) {
      if (install.version) existing.build = install.version;
    } else {
      this.prefs.games.push({
        path: install.path,
        launcher: install.launcher,
        build: install.version,
        label: install.product === 'prot' ? 'PTR' : install.launcher === 'steam' ? 'Steam' : install.launcher === 'battlenet' ? 'Battle.net' : 'Overwatch',
      });
    }
    if (select || !this.prefs.game) this.prefs.game = existing?.path ?? install.path;
  }

  removeGame(path: string) {
    this.prefs.games = this.prefs.games.filter((g) => g.path !== path);
    if (this.prefs.game === path) this.prefs.game = this.prefs.games[0]?.path ?? '';
  }

  /** Remember the game build DataTool reported for an install. */
  setGameBuild(path: string, build: string) {
    const g = this.prefs.games.find((x) => x.path.toLowerCase() === path.toLowerCase());
    if (g && g.build !== build) g.build = build;
  }

  // --- Presets & history -------------------------------------------------------

  savePreset(name: string, task: TaskForm): Preset {
    const p: Preset = { id: uid('preset'), name, task: clone(task), createdAt: Date.now() };
    this.presets.push(p);
    return p;
  }

  deletePreset(id: string) {
    this.presets = this.presets.filter((p) => p.id !== id);
  }

  record(task: TaskForm, status: HistoryEntry['status']) {
    this.history.unshift({ id: uid('h'), at: Date.now(), task: clone(task), status });
    if (this.history.length > HISTORY_LIMIT) this.history.length = HISTORY_LIMIT;
  }

  notify(text: string, kind: 'info' | 'error' | 'success' = 'info', action?: { label: string; run: () => void }) {
    const id = Date.now();
    this.toast = { id, text, kind, action };
    setTimeout(() => {
      if (this.toast?.id === id) this.toast = null;
    }, kind === 'error' ? 9000 : 5000);
  }
}

export const app = new AppState();
