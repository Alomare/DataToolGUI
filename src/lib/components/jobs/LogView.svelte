<script lang="ts">
  import type { LogLine } from '$lib/jobs.svelte';

  let { lines, dropped = 0, follow = true }: { lines: LogLine[]; dropped?: number; follow?: boolean } = $props();

  type Filter = 'all' | 'problems' | 'steps';
  let filter = $state<Filter>('all');
  let search = $state('');
  let showAll = $state(false);
  let box = $state<HTMLDivElement>();
  let atBottom = $state(true);

  const WINDOW = 1500;

  let filtered = $derived.by(() => {
    const q = search.trim().toLowerCase();
    return lines.filter((l) => {
      if (filter === 'problems' && l.kind !== 'error' && l.kind !== 'warn') return false;
      if (filter === 'steps' && l.kind !== 'step' && l.kind !== 'success' && l.kind !== 'error') return false;
      return !q || l.text.toLowerCase().includes(q);
    });
  });
  let visible = $derived(showAll ? filtered : filtered.slice(-WINDOW));
  let problems = $derived(lines.filter((l) => l.kind === 'error' || l.kind === 'warn').length);

  // Keep the newest lines in view while the user hasn't scrolled up.
  $effect(() => {
    void visible.length;
    if (follow && atBottom && box) box.scrollTop = box.scrollHeight;
  });
</script>

<div class="log">
  <div class="tools">
    <div class="seg">
      <button class:active={filter === 'all'} onclick={() => (filter = 'all')}>All</button>
      <button class:active={filter === 'steps'} onclick={() => (filter = 'steps')}>Steps</button>
      <button class:active={filter === 'problems'} onclick={() => (filter = 'problems')}>Problems{problems ? ` (${problems})` : ''}</button>
    </div>
    <input type="search" placeholder="Search log" bind:value={search} />
    <button class="btn ghost small" onclick={() => navigator.clipboard.writeText(lines.map((l) => l.text).join('\n'))}>Copy log</button>
  </div>
  <div
    class="lines"
    bind:this={box}
    onscroll={() => {
      if (box) atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 30;
    }}
  >
    {#if dropped || (!showAll && filtered.length > WINDOW)}
      <div class="more">
        {#if dropped}{dropped.toLocaleString()} early lines were dropped to save memory.{/if}
        {#if !showAll && filtered.length > WINDOW}
          Showing the last {WINDOW.toLocaleString()} of {filtered.length.toLocaleString()} lines.
          <button class="link-btn" onclick={() => (showAll = true)}>Show all</button>
        {/if}
      </div>
    {/if}
    {#each visible as l (l.n)}
      <div class="line {l.kind}">{l.text}</div>
    {:else}
      <div class="more">{lines.length ? 'No lines match.' : 'No output yet.'}</div>
    {/each}
  </div>
</div>

<style>
  .log {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }
  .tools {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px;
    border-bottom: 1px solid var(--border);
    background: var(--surface-2);
  }
  .tools input {
    height: 26px;
    max-width: 220px;
  }
  .seg {
    display: inline-flex;
    gap: 2px;
    padding: 2px;
    border-radius: var(--radius-sm);
    background: var(--surface-3);
  }
  .seg button {
    border: 0;
    background: transparent;
    height: 22px;
    padding: 0 8px;
    border-radius: 4px;
    font-size: 12px;
    color: var(--text-2);
  }
  .seg button.active {
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
  }
  .lines {
    flex: 1;
    min-height: 120px;
    overflow: auto;
    padding: 6px 0;
    background: var(--surface);
    font-family: var(--mono);
    font-size: 12px;
    line-height: 1.55;
    user-select: text;
  }
  .line {
    padding: 0 10px;
    white-space: pre-wrap;
    word-break: break-word;
    tab-size: 3;
  }
  .line.error {
    color: var(--danger);
    background: var(--danger-soft);
  }
  .line.warn {
    color: var(--warn);
  }
  .line.success {
    color: var(--ok);
    font-weight: 600;
  }
  .line.meta {
    color: var(--text-3);
  }
  .line.step {
    font-weight: 600;
  }
  .line.detail {
    color: var(--text-2);
  }
  .more {
    padding: 4px 10px 8px;
    color: var(--text-3);
    font-family: var(--font);
    font-size: 12px;
  }
</style>
