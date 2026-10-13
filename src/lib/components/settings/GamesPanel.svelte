<script lang="ts">
  import { open } from '@tauri-apps/plugin-dialog';
  import { openPath } from '@tauri-apps/plugin-opener';
  import { FolderOpen, FolderPlus, LoaderCircle, Radar, Trash2 } from '@lucide/svelte';
  import * as backend from '$lib/backend';
  import type { GameInstall } from '$lib/backend';
  import { app } from '$lib/state.svelte';

  let { compact = false }: { compact?: boolean } = $props();

  let detecting = $state(false);
  let detected = $state<GameInstall[] | null>(null);
  let message = $state('');

  let unsaved = $derived((detected ?? []).filter((d) => !app.prefs.games.some((g) => g.path.toLowerCase() === d.path.toLowerCase())));

  export async function detect() {
    detecting = true;
    message = '';
    try {
      detected = await backend.detectInstalls();
      // First run: take what we found.
      if (!app.prefs.games.length && detected.length) {
        for (const d of detected) app.addGame(d, false);
      }
      if (!detected.length) message = 'No Overwatch install found. Choose its folder.';
    } catch (e) {
      message = backend.errorText(e);
    } finally {
      detecting = false;
    }
  }

  async function browse() {
    const path = await open({ directory: true, title: 'Overwatch folder' });
    if (typeof path !== 'string') return;
    const check = await backend.checkInstall(path);
    if (check.looksValid && check.install) {
      app.addGame(check.install);
      message = '';
    } else if (check.install) {
      message = check.message ?? '';
      app.addGame(check.install);
    } else {
      message = check.message ?? 'Not an Overwatch folder';
    }
  }
</script>

<section class={compact ? '' : 'panel'}>
  {#if !compact}
    <header>
      <h2>Overwatch</h2>
      <span class="spacer"></span>
      <button class="btn small" onclick={detect} disabled={detecting}>
        {#if detecting}<LoaderCircle size={13} class="spin" />{:else}<Radar size={13} />{/if} Find installs
      </button>
      <button class="btn small" onclick={browse}><FolderPlus size={13} /> Add folder…</button>
    </header>
  {/if}

  <div class="list">
    {#each app.prefs.games as g (g.path)}
      <label class="item" class:current={app.prefs.game === g.path}>
        <input type="radio" name="game" value={g.path} bind:group={app.prefs.game} />
        <div class="grow">
          <div class="row">
            <strong>{g.label}</strong>
            {#if g.build}<span class="tiny faint">build {g.build}</span>{/if}
          </div>
          <div class="tiny faint ellipsis" data-tip={g.path}>{g.path}</div>
        </div>
        <button class="btn ghost icon small" aria-label="Open folder" data-tip="Open folder" onclick={() => openPath(g.path)}><FolderOpen size={14} /></button>
        <button class="btn ghost icon small" aria-label="Forget install" data-tip="Remove from the list" onclick={() => app.removeGame(g.path)}><Trash2 size={14} /></button>
      </label>
    {:else}
      <p class="small muted">No Overwatch install chosen yet.</p>
    {/each}
    {#each unsaved as d (d.path)}
      <div class="item found">
        <div class="grow">
          <div class="row"><strong>Found: {d.launcher === 'steam' ? 'Steam' : d.launcher === 'battlenet' ? 'Battle.net' : 'Overwatch'}</strong> <span class="tiny faint">{d.source}</span></div>
          <div class="tiny faint ellipsis">{d.path}</div>
        </div>
        <button class="btn small" onclick={() => app.addGame(d)}>Use</button>
      </div>
    {/each}
  </div>

  {#if compact}
    <div class="row" style="margin-top: 8px">
      <button class="btn small" onclick={detect} disabled={detecting}>
        {#if detecting}<LoaderCircle size={13} class="spin" />{:else}<Radar size={13} />{/if} Find installs
      </button>
      <button class="btn small" onclick={browse}><FolderPlus size={13} /> Choose folder…</button>
    </div>
  {/if}
  {#if message}<p class="small warn">{message}</p>{/if}
  {#if !compact}
    <p class="tiny faint" style="margin-top: 8px">
      Close Overwatch and Battle.net while extracting. DataTool reads the files of the folder chosen here, in the languages you have installed.
    </p>
  {/if}
</section>

<style>
  .list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 10px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    cursor: pointer;
  }
  .item.current {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .item.found {
    border-style: dashed;
    cursor: default;
  }
  .item input {
    accent-color: var(--accent);
  }
  .warn {
    color: var(--warn);
    margin-top: 6px;
  }
</style>
