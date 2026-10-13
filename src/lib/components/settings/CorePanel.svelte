<script lang="ts">
  import { open } from '@tauri-apps/plugin-dialog';
  import { openPath, openUrl } from '@tauri-apps/plugin-opener';
  import { ChevronRight, Download, ExternalLink, FileArchive, FolderOpen, LoaderCircle, RefreshCw, Trash2, TriangleAlert } from '@lucide/svelte';
  import Field from '$lib/components/ui/Field.svelte';
  import Toggle from '$lib/components/ui/Toggle.svelte';
  import * as backend from '$lib/backend';
  import type { CoreInfo, Release } from '$lib/backend';
  import { cores, gameBuildNumber, releaseAsset, supportedGameVersion } from '$lib/core.svelte';
  import { app } from '$lib/state.svelte';
  import { formatBytes, formatDate } from '$lib/util';

  let busy = $state('');
  let showAll = $state(false);
  let notesOpen = $state<Record<string, boolean>>({});

  let releases = $derived(cores.releases.filter((r) => releaseAsset(r)));
  let shown = $derived(showAll ? releases : releases.slice(0, 6));
  let gameBuild = $derived(app.game?.build ?? null);
  let gameAhead = $derived(!!gameBuild && !!cores.supportsGame && gameBuildNumber(gameBuild) > gameBuildNumber(cores.supportsGame));

  async function act(label: string, f: () => Promise<unknown>) {
    busy = label;
    try {
      await f();
    } catch (e) {
      app.notify(backend.errorText(e), 'error');
    } finally {
      busy = '';
    }
  }

  async function install(r: Release) {
    await act(`install-${r.tag_name}`, async () => {
      await cores.install(r);
      app.notify(`DataTool ${r.tag_name} installed and in use`, 'success');
    });
  }

  async function installZip() {
    const path = await open({ filters: [{ name: 'DataTool zip', extensions: ['zip'] }] });
    if (typeof path !== 'string') return;
    await act('zip', async () => {
      await cores.installZip(path);
      app.notify('DataTool installed from zip', 'success');
    });
  }

  async function useFolder() {
    const path = await open({ directory: true, title: 'Folder that contains DataTool.exe' });
    if (typeof path !== 'string') return;
    await act('folder', () => cores.useFolder(path));
  }

  function isActive(c: CoreInfo) {
    return cores.active?.dir === c.dir;
  }

  const notesText = (r: Release) => (r.body ?? '').replace(/\r/g, '').replace(/\*\*/g, '').trim();
</script>

<section class="panel">
  <header>
    <h2>DataTool</h2>
    <span class="spacer"></span>
    <button class="btn small" onclick={() => act('check', () => cores.checkUpdates(true))} disabled={cores.checking}>
      <RefreshCw size={13} class={cores.checking ? 'spin' : ''} /> Check for updates
    </button>
  </header>

  {#if cores.active}
    <div class="active">
      <div class="grow">
        <div class="row">
          <strong class="ver">{cores.activeVersion ?? 'Unknown version'}</strong>
          {#if cores.update}<span class="badge warn">update available</span>{:else if cores.latest}<span class="badge ok">latest</span>{/if}
          {#if !cores.active.managed}<span class="badge">your folder</span>{/if}
        </div>
        <div class="small muted">
          {#if cores.supportsGame}For Overwatch {cores.supportsGame}{/if}
          {#if gameBuild} · your game: {gameBuild}{/if}
          {#if cores.version} · reports v{cores.version}{/if}
        </div>
        <div class="tiny faint ellipsis" data-tip={cores.active.dir}>{cores.active.dir}</div>
      </div>
      <button class="btn small" onclick={() => openPath(cores.active!.dir)}><FolderOpen size={13} /> Folder</button>
      {#if cores.active.tankview}
        <button
          class="btn small"
          data-tip="TankView ships with DataTool: a viewer for browsing the game files"
          onclick={() => backend.launch(cores.active!.tankview!).catch((e) => app.notify(backend.errorText(e), 'error'))}
        >
          <ExternalLink size={13} /> TankView
        </button>
      {/if}
    </div>
    {#if cores.schemaError}
      <div class="notice danger small"><TriangleAlert size={15} /><span>This DataTool didn't describe its modes ({cores.schemaError}). The app is using its built-in list instead.</span></div>
    {/if}
    {#if gameAhead}
      <div class="notice warn small">
        <TriangleAlert size={15} />
        <span>Your game ({gameBuild}) is newer than this DataTool supports ({cores.supportsGame}). {cores.update ? 'Install the update below.' : 'Watch for a new DataTool release; they usually follow game patches within days.'}</span>
      </div>
    {/if}
    {#if cores.active.argsFile}
      <div class="notice warn small">
        <TriangleAlert size={15} />
        <span class="grow">This DataTool has saved arguments (<code>DataTool.args</code>) that it adds to every run, which can make runs behave unexpectedly.</span>
        <button class="btn small" onclick={() => act('args', () => cores.deleteArgsFile())}>Delete them</button>
      </div>
    {/if}
  {:else if cores.customError}
    <div class="notice danger small">Your DataTool folder can't be used: {cores.customError}</div>
  {:else}
    <div class="notice warn small">DataTool isn't installed yet. Install the latest release below (about {releases[0] ? formatBytes(releaseAsset(releases[0])!.size) : '75 MB'}).</div>
  {/if}

  {#if cores.installing}
    {@const i = cores.installing}
    <div class="installing">
      <LoaderCircle size={15} class="spin" />
      <span class="small">{i.stage === 'download' ? 'Downloading' : 'Unpacking'} {i.tag}</span>
      <div class="progress grow" class:indeterminate={i.stage === 'extract' || !i.total}><div style:width="{i.total ? (i.received / i.total) * 100 : 0}%"></div></div>
      {#if i.stage === 'download'}<span class="tiny muted">{formatBytes(i.received)}{i.total ? ` / ${formatBytes(i.total)}` : ''}</span>{/if}
    </div>
  {/if}

  {#if cores.installed.length || cores.custom}
    <h3 class="sub">Installed</h3>
    <div class="list">
      {#each cores.installed as c (c.dir)}
        <div class="item" class:current={isActive(c)}>
          <div class="grow">
            <strong>{c.manifest?.tag ?? c.name}</strong>
            <span class="tiny faint">
              {#if supportedGameVersion(c.manifest?.notes)}for {supportedGameVersion(c.manifest?.notes)} ·{/if}
              {c.manifest?.publishedAt ? `released ${formatDate(c.manifest.publishedAt)}` : c.manifest?.source === 'zip' ? 'from a zip' : ''}
            </span>
          </div>
          {#if isActive(c)}
            <span class="badge accent">in use</span>
          {:else}
            <button class="btn small" onclick={() => act(`use-${c.name}`, () => cores.use(c))}>Use</button>
            <button class="btn ghost icon small" aria-label="Remove {c.name}" data-tip="Remove this version" onclick={() => act(`rm-${c.name}`, () => cores.remove(c))}>
              <Trash2 size={14} />
            </button>
          {/if}
        </div>
      {/each}
      {#if app.prefs.customCore}
        <div class="item current">
          <div class="grow"><strong>Your folder</strong> <span class="tiny faint">{app.prefs.customCore}</span></div>
          <button class="btn small" onclick={() => act('uncustom', async () => { app.prefs.customCore = ''; await cores.refresh(); })}>Stop using</button>
        </div>
      {/if}
    </div>
  {/if}

  <h3 class="sub">Releases</h3>
  {#if cores.releasesError}
    <div class="notice danger small">{cores.releasesError}</div>
  {:else if !releases.length}
    <div class="row small muted">
      {#if cores.checking}<LoaderCircle size={14} class="spin" /> Checking GitHub…{:else}<button class="link-btn" onclick={() => cores.checkUpdates(true)}>Load releases from GitHub</button>{/if}
    </div>
  {/if}
  <div class="list">
    {#each shown as r (r.tag_name)}
      {@const installed = cores.isInstalled(r.tag_name)}
      {@const asset = releaseAsset(r)!}
      <div class="item release">
        <div class="grow">
          <div class="row">
            <strong>{r.tag_name}</strong>
            {#if r === cores.latest}<span class="badge ok">latest</span>{/if}
            {#if r.prerelease}<span class="badge warn">pre-release</span>{/if}
            <span class="tiny faint">{formatDate(r.published_at)} · {formatBytes(asset.size)}</span>
          </div>
          {#if supportedGameVersion(r.body)}<div class="tiny muted">For Overwatch {supportedGameVersion(r.body)}</div>{/if}
          {#if notesText(r)}
            <button class="link-btn tiny notes-toggle" onclick={() => (notesOpen[r.tag_name] = !notesOpen[r.tag_name])}>
              <span class="chev" class:open={notesOpen[r.tag_name]}><ChevronRight size={11} /></span> Release notes
            </button>
            {#if notesOpen[r.tag_name]}<div class="notes small">{notesText(r)}</div>{/if}
          {/if}
        </div>
        {#if installed && isActive(installed)}
          <span class="badge accent">in use</span>
        {:else if installed}
          <button class="btn small" onclick={() => act(`use-${installed.name}`, () => cores.use(installed))}>Use</button>
        {:else}
          <button class="btn small" class:primary={r === cores.update || !cores.active} disabled={!!cores.installing} onclick={() => install(r)}>
            <Download size={13} /> Install
          </button>
        {/if}
        <button class="btn ghost icon small" aria-label="Open release page" data-tip="Open on GitHub" onclick={() => openUrl(r.html_url)}><ExternalLink size={13} /></button>
      </div>
    {/each}
    {#if releases.length > 6}
      <button class="link-btn small" onclick={() => (showAll = !showAll)}>{showAll ? 'Show fewer' : `Show all ${releases.length} releases`}</button>
    {/if}
  </div>

  <div class="row wrap" style="margin-top: 12px">
    <button class="btn small" onclick={installZip} disabled={!!cores.installing}><FileArchive size={13} /> Install from zip…</button>
    <button class="btn small" onclick={useFolder}><FolderOpen size={13} /> Use a DataTool folder…</button>
  </div>

  <div class="opts">
    <Toggle bind:checked={app.prefs.checkUpdates} label="Check for DataTool updates on start" />
    <Toggle bind:checked={app.prefs.autoInstall} label="Install updates automatically" help="Downloads and switches to a new release as soon as it's found. Older versions stay installed for rollback." disabled={!app.prefs.checkUpdates} />
    <Field label="Versions to keep" inline help="After an update, older installed versions beyond this number are removed. The one in use is always kept.">
      <input type="number" min="1" max="20" bind:value={app.prefs.keepCores} style="width: 70px" />
    </Field>
  </div>
  {#if busy}<span class="tiny faint">Working…</span>{/if}
</section>

<style>
  .active {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    margin-bottom: 10px;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    border: 1px solid var(--border);
  }
  .ver {
    font-size: 15px;
  }
  .notice {
    margin-bottom: 10px;
  }
  .installing {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }
  .sub {
    margin: 14px 0 6px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-3);
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
  }
  .item.current {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .item .grow {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .release {
    align-items: flex-start;
  }
  .notes-toggle {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    width: fit-content;
  }
  .chev {
    display: inline-flex;
    transition: transform 0.1s;
  }
  .chev.open {
    transform: rotate(90deg);
  }
  .notes {
    white-space: pre-wrap;
    margin-top: 4px;
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text-2);
  }
  .opts {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
  }
</style>
