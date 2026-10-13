<script lang="ts">
  import { untrack } from 'svelte';
  import { ChevronRight } from '@lucide/svelte';
  import JsonNode from './JsonNode.svelte';

  let { name, value, depth = 0, open = depth < 1 }: { name: string | null; value: unknown; depth?: number; open?: boolean } = $props();

  // Starts as the `open` prop says, then is the user's to toggle.
  let expanded = $state(untrack(() => open));

  const PAGE = 200;
  let limit = $state(PAGE);

  let isObj = $derived(value !== null && typeof value === 'object');
  let entries = $derived(isObj ? Object.entries(value as object) : []);
  let summary = $derived(Array.isArray(value) ? `[${(value as unknown[]).length}]` : isObj ? `{${entries.length}}` : '');
  /** A friendly label for an object: its Name/name field, if any. */
  let label = $derived.by(() => {
    if (!isObj || Array.isArray(value)) return '';
    const v = value as Record<string, unknown>;
    const n = v.Name ?? v.name ?? v.DisplayName ?? v.Title;
    return typeof n === 'string' ? n : '';
  });
</script>

<div class="node" style:--depth={depth}>
  {#if isObj}
    <button class="key" onclick={() => (expanded = !expanded)}>
      <span class="chev" class:open={expanded}><ChevronRight size={12} /></span>
      {#if name !== null}<span class="k">{name}</span>{/if}
      <span class="sum">{summary}</span>
      {#if label}<span class="lbl">{label}</span>{/if}
    </button>
    {#if expanded}
      {#each entries.slice(0, limit) as [k, v] (k)}
        <JsonNode name={k} value={v} depth={depth + 1} open={false} />
      {/each}
      {#if entries.length > limit}
        <button class="link-btn more" onclick={() => (limit += PAGE * 5)}>Show {Math.min(PAGE * 5, entries.length - limit)} more of {entries.length - limit}</button>
      {/if}
    {/if}
  {:else}
    <div class="leaf">
      {#if name !== null}<span class="k">{name}</span>{/if}
      <span class="v {value === null ? 'null' : typeof value}">{typeof value === 'string' ? `"${value}"` : String(value)}</span>
    </div>
  {/if}
</div>

<style>
  .node {
    font-family: var(--mono);
    font-size: 12.5px;
    line-height: 1.6;
  }
  .key,
  .leaf,
  .more {
    padding-left: calc(var(--depth) * 16px);
  }
  .key {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    border: 0;
    background: none;
    text-align: left;
    font: inherit;
  }
  .key:hover {
    background: var(--surface-3);
  }
  .leaf {
    display: flex;
    gap: 6px;
    padding-left: calc(var(--depth) * 16px + 18px);
    user-select: text;
  }
  .chev {
    display: inline-flex;
    color: var(--text-3);
    transition: transform 0.1s;
  }
  .chev.open {
    transform: rotate(90deg);
  }
  .k {
    color: var(--accent);
  }
  .k::after {
    content: ':';
    color: var(--text-3);
  }
  .sum {
    color: var(--text-3);
  }
  .lbl {
    color: var(--text-2);
    font-family: var(--font);
    font-style: italic;
  }
  .v {
    word-break: break-word;
  }
  .v.string {
    color: var(--ok);
  }
  .v.number {
    color: #3b82f6;
  }
  .v.boolean,
  .v.null {
    color: var(--warn);
  }
  .more {
    display: block;
    margin-left: 18px;
    font-family: var(--font);
    font-size: 12px;
  }
</style>
