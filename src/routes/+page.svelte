<script lang="ts">
  import { onMount } from 'svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { X } from '@lucide/svelte';
  import * as backend from '$lib/backend';
  import HomePage from '$lib/components/HomePage.svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import FilesPage from '$lib/components/files/FilesPage.svelte';
  import JobsDock from '$lib/components/jobs/JobsDock.svelte';
  import JobsPage from '$lib/components/jobs/JobsPage.svelte';
  import ModePage from '$lib/components/mode/ModePage.svelte';
  import SettingsPage from '$lib/components/settings/SettingsPage.svelte';
  import { cores } from '$lib/core.svelte';
  import { queue } from '$lib/jobs.svelte';
  import { app } from '$lib/state.svelte';

  let ready = $state(false);
  let loadError = $state('');

  onMount(() => {
    (async () => {
      try {
        await queue.init();
        await app.load();
        await cores.refresh();
        ready = true;
      } catch (e) {
        loadError = backend.errorText(e);
        return;
      }
      // First run: find the game without being asked.
      if (!app.prefs.games.length) {
        const found = await backend.detectInstalls().catch(() => []);
        for (const g of found) app.addGame(g, false);
      }
      if (app.prefs.checkUpdates || !cores.active) {
        await cores.checkUpdates(!cores.active);
        const u = cores.update;
        if (u && app.prefs.autoInstall && !queue.active) {
          cores
            .install(u)
            .then(() => app.notify(`DataTool updated to ${u.tag_name}`, 'success'))
            .catch((e) => app.notify(`DataTool update failed: ${backend.errorText(e)}`, 'error'));
        }
      }
    })();
  });

  // Persist settings whenever they change.
  $effect(() => {
    JSON.stringify([app.prefs, app.tasks, app.presets, app.history]);
    app.scheduleSave();
  });

  // Theme
  $effect(() => {
    const t = app.prefs.theme;
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  });

  // The running job in the window title, so it shows in the taskbar.
  $effect(() => {
    const a = queue.active;
    const title = a ? `${a.title}: ${a.step || 'running'} — DataTool GUI` : 'DataTool GUI';
    getCurrentWindow().setTitle(title).catch(() => {});
  });

  let mode = $derived(app.page === 'mode' ? cores.schema.modes.find((m) => m.keyword === app.mode) : undefined);
  let task = $derived(mode ? app.tasks[mode.keyword] : undefined);
</script>

<div class="app">
  <Sidebar />
  <div class="main">
    <main class:fill={app.page === 'jobs' || app.page === 'files'}>
      {#if loadError}
        <div class="notice danger">Couldn't start: {loadError}</div>
      {:else if !ready}
        <div class="empty">Loading…</div>
      {:else if app.page === 'mode'}
        {#if mode && task}
          {#key mode.keyword}
            <ModePage {mode} {task} />
          {/key}
        {:else}
          <div class="empty">
            The mode "{app.mode}" isn't available in this DataTool build.
            <button class="link-btn" onclick={() => (app.page = 'home')}>Go home</button>
          </div>
        {/if}
      {:else if app.page === 'jobs'}
        <JobsPage />
      {:else if app.page === 'files'}
        <FilesPage />
      {:else if app.page === 'settings'}
        <SettingsPage />
      {:else}
        <HomePage />
      {/if}
    </main>
    <div class="dock"><JobsDock /></div>
  </div>

  {#if app.toast}
    <div class="toast {app.toast.kind}" role="status">
      <span class="grow">{app.toast.text}</span>
      {#if app.toast.action}
        {@const action = app.toast.action}
        <button
          class="btn small"
          onclick={() => {
            action.run();
            app.toast = null;
          }}>{action.label}</button
        >
      {/if}
      <button class="btn ghost icon small" aria-label="Dismiss" onclick={() => (app.toast = null)}><X size={14} /></button>
    </div>
  {/if}
</div>

<style>
  .app {
    display: flex;
    height: 100vh;
  }
  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  main {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 18px 20px;
  }
  main.fill {
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  main.fill > :global(*) {
    flex: 1;
    min-height: 0;
  }
  .dock {
    flex: none;
    padding: 0 12px;
  }
  .dock:not(:empty) {
    padding-bottom: 10px;
  }
  .toast {
    position: fixed;
    right: 18px;
    bottom: 18px;
    z-index: 700;
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: 520px;
    padding: 10px 10px 10px 14px;
    border-radius: var(--radius);
    background: var(--surface);
    border: 1px solid var(--border);
    border-left: 4px solid var(--accent);
    box-shadow: var(--shadow-lg);
    font-size: 13px;
  }
  .toast.error {
    border-left-color: var(--danger);
  }
  .toast.success {
    border-left-color: var(--ok);
  }
</style>
