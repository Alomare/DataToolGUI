// The DataTool build in use ("core"): installing and updating it from GitHub
// releases, switching between installed versions, and reading what it can do.

import * as backend from './backend';
import type { CoreInfo, CoreManifest, Release } from './backend';
import { buildSchema, parseCoreVersion, type Schema, type ToolInfo } from './datatool/schema';
import { app } from './state.svelte';
import { basename, compareVersions, joinPath, safeName } from './util';

export const RELEASE_REPO = 'overtools/OWLib';
const CHECK_INTERVAL = 6 * 3600 * 1000;

/** The zip to download from a DataTool release (Windows toolchain build). */
export function releaseAsset(r: Release) {
  const zips = r.assets.filter((a) => a.name.toLowerCase().endsWith('.zip'));
  return (
    zips.find((a) => a.name === 'toolchain-release.zip') ??
    zips.find((a) => /release/i.test(a.name) && !/debug|linux|osx|mac/i.test(a.name)) ??
    zips.find((a) => !/debug|linux|osx|mac/i.test(a.name)) ??
    null
  );
}

/** "Supports Overwatch 2.25.0.0.154088" in release notes. */
export function supportedGameVersion(notes: string | null | undefined): string | null {
  return /Supports Overwatch\s+v?([\d.]+\d)/i.exec(notes ?? '')?.[1] ?? null;
}

/**
 * Comparable key for a DataTool version: release tags look like
 * "v2.25.0.0+1151" and the tool reports "2.25.0.0+1151+68397365" (with the
 * commit hash), so only the version and CI build number count.
 */
export function coreKey(v: string | null | undefined): string {
  const m = /(\d+(?:\.\d+){1,3})(?:\+(\d+))?/.exec(v ?? '');
  return m ? `${m[1]}.${m[2] ?? 0}` : '0';
}

export function isNewerCore(a: string | null | undefined, b: string | null | undefined): boolean {
  return compareVersions(coreKey(a), coreKey(b)) > 0;
}

/** Last number of a game version: the build, e.g. 154088. */
export function gameBuildNumber(v: string | null | undefined): number {
  const n = (v ?? '').match(/\d+/g);
  return n ? Number(n[n.length - 1]) : 0;
}

export interface InstallProgress {
  tag: string;
  stage: 'download' | 'extract';
  received: number;
  total: number | null;
}

class Cores {
  installed = $state<CoreInfo[]>([]);
  custom = $state<CoreInfo | null>(null);
  customError = $state('');
  /** Version the active build reports, e.g. "2.25.0.0+1151+68397365". */
  version = $state<string | null>(null);
  schema = $state.raw<Schema>(buildSchema(null));
  schemaError = $state('');
  loadingSchema = $state(false);
  checked = $state(false);

  releases = $state.raw<Release[]>([]);
  releasesError = $state('');
  checking = $state(false);
  installing = $state<InstallProgress | null>(null);

  get active(): CoreInfo | null {
    if (app.prefs.customCore) return this.custom;
    return this.installed.find((c) => c.name === app.prefs.coreName) ?? this.newestInstalled ?? null;
  }

  get newestInstalled(): CoreInfo | null {
    let best: CoreInfo | null = null;
    for (const c of this.installed) {
      if (!best || isNewerCore(c.manifest?.tag ?? c.name, best.manifest?.tag ?? best.name)) best = c;
    }
    return best;
  }

  /** Tag or version of the active build, for display and comparison. */
  get activeVersion(): string | null {
    return this.active?.manifest?.tag ?? (this.version ? `v${this.version}` : null);
  }

  /** Newest stable release with a Windows zip. */
  get latest(): Release | null {
    return this.releases.find((r) => !r.prerelease && releaseAsset(r)) ?? null;
  }

  get update(): Release | null {
    const latest = this.latest;
    if (!latest || !this.active) return null;
    return isNewerCore(latest.tag_name, this.activeVersion) ? latest : null;
  }

  /** Game version the active build was released for. */
  get supportsGame(): string | null {
    const notes = this.active?.manifest?.notes ?? this.releaseFor(this.activeVersion)?.body;
    return supportedGameVersion(notes);
  }

  releaseFor(version: string | null): Release | null {
    if (!version) return null;
    const key = coreKey(version);
    return this.releases.find((r) => coreKey(r.tag_name) === key) ?? null;
  }

  isInstalled(tag: string): CoreInfo | null {
    const key = coreKey(tag);
    return this.installed.find((c) => coreKey(c.manifest?.tag ?? c.name) === key) ?? null;
  }

  /** Find installed builds and load the active one. */
  async refresh() {
    this.installed = await backend.listCores().catch(() => []);
    this.customError = '';
    if (app.prefs.customCore) {
      try {
        this.custom = await backend.openCore(app.prefs.customCore);
      } catch (e) {
        this.custom = null;
        this.customError = backend.errorText(e);
      }
    } else {
      this.custom = null;
    }
    this.checked = true;
    await this.loadSchema();
  }

  /** Ask the active DataTool what it can do (no game files needed, ~1 s). */
  async loadSchema() {
    const core = this.active;
    this.schemaError = '';
    this.version = null;
    if (!core) {
      this.schema = buildSchema(null);
      return;
    }
    this.loadingSchema = true;
    try {
      const out = joinPath(app.info!.paths.cache, `toolinfo-${safeName(core.name || basename(core.dir))}.json`);
      const [info, help] = await Promise.all([
        backend.runCapture(core.exe, ['.', 'util-tool-info', '--json', `--out=${out}`]),
        backend.runCapture(core.exe, ['--help']),
      ]);
      this.version = parseCoreVersion(info.stdout + info.stderr) ?? parseCoreVersion(help.stdout);
      const text = await backend.readText(out);
      if (!text) throw new Error((info.stderr || info.stdout).split('\n').slice(-3).join(' ') || 'DataTool produced no tool info');
      this.schema = buildSchema(JSON.parse(text) as ToolInfo, help.stdout);
    } catch (e) {
      this.schemaError = backend.errorText(e);
      this.schema = buildSchema(null);
    } finally {
      this.loadingSchema = false;
    }
  }

  /** Check GitHub for releases (rate-limited to every few hours unless forced). */
  async checkUpdates(force = false) {
    if (this.checking) return;
    if (!force && this.releases.length && Date.now() - app.prefs.lastUpdateCheck < CHECK_INTERVAL) return;
    this.checking = true;
    this.releasesError = '';
    try {
      this.releases = await backend.listReleases(RELEASE_REPO, 40);
      app.prefs.lastUpdateCheck = Date.now();
    } catch (e) {
      this.releasesError = backend.errorText(e);
    } finally {
      this.checking = false;
    }
  }

  /** Download a release, unpack it next to the others and switch to it. */
  async install(release: Release, activate = true) {
    // Already have it (e.g. after a rollback): just switch back.
    const existing = this.isInstalled(release.tag_name);
    if (existing) {
      if (activate) await this.use(existing);
      return;
    }
    const asset = releaseAsset(release);
    if (!asset) throw new Error(`Release ${release.tag_name} has no Windows zip`);
    if (this.installing) throw new Error('Another DataTool download is in progress');
    const id = `core-${release.tag_name}`;
    this.installing = { tag: release.tag_name, stage: 'download', received: 0, total: asset.size };
    const unlisten = await backend.onDownloadProgress((e) => {
      if (e.id === id && this.installing) {
        this.installing.received = e.received;
        this.installing.total = e.total ?? asset.size;
      }
    });
    const zip = joinPath(app.info!.paths.cache, `${safeName(release.tag_name)}.zip`);
    try {
      await backend.downloadFile(id, asset.browser_download_url, zip);
      this.installing.stage = 'extract';
      const manifest: CoreManifest = {
        tag: release.tag_name,
        title: release.name ?? release.tag_name,
        publishedAt: release.published_at,
        notes: release.body,
        url: release.html_url,
        installedAt: new Date().toISOString(),
        source: 'github',
      };
      const core = await backend.installCore(zip, release.tag_name, manifest);
      if (activate) {
        app.prefs.customCore = '';
        app.prefs.coreName = core.name;
      }
    } finally {
      unlisten();
      this.installing = null;
      await backend.removeFile(zip).catch(() => {});
    }
    await this.refresh();
    await this.prune();
  }

  /** Install a DataTool zip from disk (e.g. a build shared on Discord). */
  async installZip(path: string) {
    const name = `local-${safeName(basename(path).replace(/\.zip$/i, ''))}-${new Date().toISOString().slice(0, 10)}`;
    const manifest: CoreManifest = { tag: name, title: basename(path), installedAt: new Date().toISOString(), source: 'zip' };
    this.installing = { tag: basename(path), stage: 'extract', received: 0, total: null };
    try {
      const core = await backend.installCore(path, name, manifest);
      app.prefs.customCore = '';
      app.prefs.coreName = core.name;
    } finally {
      this.installing = null;
    }
    await this.refresh();
    // The zip name says nothing about the version; record what the tool reports.
    const core = this.active;
    if (core?.manifest && this.version) {
      core.manifest.tag = `v${this.version.replace(/\+[0-9a-f]{8,}$/i, '')}`;
      await backend.writeText(joinPath(core.dir, '.datatoolgui.json'), JSON.stringify(core.manifest, null, 2)).catch(() => {});
    }
  }

  async use(core: CoreInfo) {
    app.prefs.customCore = core.managed ? '' : core.dir;
    app.prefs.coreName = core.managed ? core.name : app.prefs.coreName;
    await this.refresh();
  }

  async useFolder(path: string) {
    const core = await backend.openCore(path);
    app.prefs.customCore = core.dir;
    await this.refresh();
  }

  async remove(core: CoreInfo) {
    await backend.removeCore(core.name);
    if (app.prefs.coreName === core.name) app.prefs.coreName = '';
    await this.refresh();
  }

  /** Keep the newest `keepCores` installed builds (and always the active one). */
  async prune() {
    const keep = Math.max(1, app.prefs.keepCores);
    const sorted = [...this.installed].sort((a, b) => compareVersions(coreKey(b.manifest?.tag ?? b.name), coreKey(a.manifest?.tag ?? a.name)));
    const active = this.active?.name;
    const extra = sorted.slice(keep).filter((c) => c.name !== active);
    for (const c of extra) await backend.removeCore(c.name).catch(() => {});
    if (extra.length) this.installed = await backend.listCores().catch(() => this.installed);
  }

  async deleteArgsFile() {
    const f = this.active?.argsFile;
    if (!f) return;
    await backend.deleteArgsFile(f);
    await this.refresh();
  }
}

export const cores = new Cores();
