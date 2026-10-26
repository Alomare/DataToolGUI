<script lang="ts">
  import { ChevronRight, FolderTree, House, ListChecks, Search, Settings } from '@lucide/svelte';
  import { cores } from '$lib/core.svelte';
  import { CATEGORIES } from '$lib/datatool/extras';
  import type { Mode } from '$lib/datatool/schema';
  import { queue } from '$lib/jobs.svelte';
  import { app, type Page } from '$lib/state.svelte';

  let search = $state('');
  let collapsed = $state<Record<string, boolean>>({});

  let groups = $derived.by(() => {
    const q = search.trim().toLowerCase();
    const visible = cores.schema.modes.filter(
      (m) => !q || m.label.toLowerCase().includes(q) || m.keyword.includes(q) || m.description.toLowerCase().includes(q),
    );
    return CATEGORIES.map((c) => ({ ...c, modes: visible.filter((m) => m.category === c.id) })).filter((g) => g.modes.length);
  });

  const NAV: { id: Page; label: string; icon: typeof House }[] = [
    { id: 'home', label: 'Home', icon: House },
    { id: 'jobs', label: 'Jobs', icon: ListChecks },
    { id: 'files', label: 'Files', icon: FolderTree },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  function open(m: Mode) {
    if (!app.tasks[m.keyword]) app.openMode(m.keyword, { ...app.task(m.keyword), output: app.prefs.outputDir });
    else app.openMode(m.keyword);
  }
</script>

<aside class="side">
  <div class="brand">
    <span class="logo" aria-hidden="true"></span>
    <span>DataTool <span class="faint">GUI</span></span>
  </div>

  <nav>
    {#each NAV as n (n.id)}
      {@const Icon = n.icon}
      <button class="nav" class:active={app.page === n.id} onclick={() => (app.page = n.id)}>
        <Icon size={16} />
        <span class="grow">{n.label}</span>
        {#if n.id === 'jobs' && queue.pending}<span class="badge accent">{queue.pending}</span>{/if}
        {#if n.id === 'settings' && (cores.update || (cores.checked && !cores.active) || !app.prefs.game)}<span class="dot" data-tip="Needs attention"></span>{/if}
      </button>
    {/each}
  </nav>

  <div class="search">
    <Search size={14} />
    <input type="search" placeholder="Find a mode" bind:value={search} spellcheck="false" />
  </div>

  <div class="modes">
    {#each groups as g (g.id)}
      {@const isCollapsed = !search && collapsed[g.id]}
      <div class="group">
        <button class="group-head" onclick={() => (collapsed[g.id] = !collapsed[g.id])} data-tip={g.description}>
          <span class="chev" class:open={!isCollapsed}><ChevronRight size={12} /></span>
          {g.label}
        </button>
        {#if !isCollapsed}
          {#each g.modes as m (m.keyword)}
            <button class="mode" data-mode={m.keyword} class:active={app.page === 'mode' && app.mode === m.keyword} onclick={() => open(m)} data-tip={`${m.description || m.label}\n${m.keyword}`}>
              <span class="ellipsis">{m.label}</span>
            </button>
          {/each}
        {/if}
      </div>
    {:else}
      {#if search}
        <p class="tiny faint pad">No mode matches "{search}".</p>
      {:else if cores.loadingSchema}
        <p class="tiny faint pad">Reading DataTool's modes…</p>
      {:else}
        <p class="tiny faint pad">No modes yet. Set up DataTool in <button class="link-btn" onclick={() => (app.page = 'settings')}>Settings</button>.</p>
      {/if}
    {/each}
  </div>
</aside>

<style>
  .side {
    display: flex;
    flex-direction: column;
    width: 248px;
    flex: none;
    background: var(--surface);
    border-right: 1px solid var(--border);
    min-height: 0;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 9px;
    height: 52px;
    padding: 0 16px;
    font-weight: 700;
    font-size: 15px;
  }
  /* The glyph is a mask so it takes the theme's accent colour. */
  .logo {
    width: 22px;
    height: 22px;
    flex: none;
    background: var(--accent);
    mask: url('/logo.png') center / contain no-repeat;
  }
  nav {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 0 8px 8px;
    border-bottom: 1px solid var(--border);
  }
  .nav,
  .mode {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    text-align: left;
    color: var(--text-2);
  }
  .nav {
    height: 32px;
    padding: 0 10px;
    font-weight: 500;
  }
  .nav:hover,
  .mode:hover {
    background: var(--surface-3);
    color: var(--text);
  }
  .nav.active,
  .mode.active {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--warn);
  }
  .search {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 10px 8px 4px;
    padding-left: 9px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    color: var(--text-3);
  }
  .search:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .search input {
    border: 0 !important;
    box-shadow: none !important;
    height: 30px;
    padding-left: 0;
    background: transparent;
  }
  .modes {
    flex: 1;
    overflow: auto;
    padding: 4px 8px 12px;
  }
  .group {
    margin-top: 6px;
  }
  .group-head {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    padding: 6px 4px;
    border: 0;
    background: none;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-3);
    text-align: left;
  }
  .chev {
    display: inline-flex;
    transition: transform 0.1s;
  }
  .chev.open {
    transform: rotate(90deg);
  }
  .mode {
    height: 28px;
    padding: 0 10px 0 22px;
    font-size: 13px;
    justify-content: space-between;
  }
  .pad {
    display: block;
    padding: 8px 10px;
  }
</style>
