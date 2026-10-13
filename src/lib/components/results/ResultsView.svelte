<script lang="ts">
  // Shows a list mode's result: JSON as a sortable, searchable table (when it
  // has rows) or a tree; text as-is.
  import { save } from '@tauri-apps/plugin-dialog';
  import { openPath } from '@tauri-apps/plugin-opener';
  import { ArrowDown, ArrowUp, Copy, ExternalLink, Save } from '@lucide/svelte';
  import JsonNode from './JsonNode.svelte';
  import { cellText, searchText, toTable } from './table';
  import * as backend from '$lib/backend';
  import { app } from '$lib/state.svelte';
  import { basename, formatBytes } from '$lib/util';

  let { path, kind }: { path: string; kind: 'json' | 'text' } = $props();

  let raw = $state('');
  let data = $state.raw<unknown>(null);
  let error = $state('');
  let loading = $state(true);
  let view = $state<'table' | 'tree' | 'raw'>('table');
  let search = $state('');
  let sortCol = $state<string | null>(null);
  let sortDir = $state<1 | -1>(1);
  let limit = $state(300);
  let selected = $state<string | null>(null);

  $effect(() => {
    const p = path;
    loading = true;
    error = '';
    data = null;
    selected = null;
    backend
      .readText(p)
      .then((text) => {
        raw = text ?? '';
        if (text === null) error = 'The result file is missing (DataTool may have written nothing).';
        else if (kind === 'json') {
          try {
            data = JSON.parse(text);
          } catch (e) {
            error = `Not valid JSON: ${backend.errorText(e)}`;
          }
        }
      })
      .catch((e) => (error = backend.errorText(e)))
      .finally(() => (loading = false));
  });

  let table = $derived(kind === 'json' && data !== null ? toTable(data) : null);
  /** The chosen view, falling back to the tree when the data isn't tabular. */
  let shown = $derived(view === 'table' && !table ? 'tree' : view);

  let rows = $derived.by(() => {
    if (!table) return [];
    const q = search.trim().toLowerCase();
    let r = q ? table.rows.filter((x) => x.key.toLowerCase().includes(q) || searchText(x.record).toLowerCase().includes(q)) : table.rows;
    if (sortCol) {
      const col = sortCol;
      const get = (x: (typeof r)[number]) => (col === '__key' ? x.key : cellText(x.record[col]));
      r = [...r].sort((a, b) => sortDir * get(a).localeCompare(get(b), undefined, { numeric: true }));
    }
    return r;
  });
  let selectedRow = $derived(table?.rows.find((r) => r.key === selected) ?? null);
  let textLines = $derived(kind === 'text' ? raw.split('\n').filter((l) => !search || l.toLowerCase().includes(search.toLowerCase())) : []);

  function sortBy(col: string) {
    if (sortCol === col) sortDir = sortDir === 1 ? -1 : 1;
    else {
      sortCol = col;
      sortDir = 1;
    }
  }

  async function saveAs() {
    const dest = await save({ defaultPath: basename(path), filters: kind === 'json' ? [{ name: 'JSON', extensions: ['json'] }] : [{ name: 'Text', extensions: ['txt'] }] });
    if (!dest) return;
    await backend.copyFile(path, dest);
    app.notify(`Saved to ${dest}`, 'success');
  }
</script>

<div class="results">
  <div class="bar">
    {#if kind === 'json'}
      <div class="seg">
        {#if table}<button class:active={shown === 'table'} onclick={() => (view = 'table')}>Table</button>{/if}
        <button class:active={shown === 'tree'} onclick={() => (view = 'tree')}>Tree</button>
        <button class:active={shown === 'raw'} onclick={() => (view = 'raw')}>Raw</button>
      </div>
    {/if}
    {#if shown === 'table' || kind === 'text'}
      <input type="search" placeholder="Search" bind:value={search} />
    {/if}
    <span class="tiny faint">
      {#if table && shown === 'table'}{rows.length.toLocaleString()} of {table.rows.length.toLocaleString()} rows ·{/if}
      {formatBytes(raw.length)}
    </span>
    <span class="spacer"></span>
    <button class="btn ghost small" onclick={() => navigator.clipboard.writeText(raw)}><Copy size={13} /> Copy</button>
    <button class="btn ghost small" onclick={saveAs}><Save size={13} /> Save as…</button>
    <button class="btn ghost small" onclick={() => openPath(path)}><ExternalLink size={13} /> Open</button>
  </div>

  {#if loading}
    <div class="empty">Loading…</div>
  {:else if error}
    <div class="notice danger small">{error}</div>
  {:else if kind === 'text'}
    <div class="text mono-block">{#each textLines.slice(0, 5000) as l, i (i)}{l}{'\n'}{/each}</div>
  {:else if shown === 'table' && table}
    <div class="split">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              {#if table.keyColumn}
                <th><button onclick={() => sortBy('__key')}>{table.keyColumn} {#if sortCol === '__key'}{#if sortDir === 1}<ArrowUp size={11} />{:else}<ArrowDown size={11} />{/if}{/if}</button></th>
              {/if}
              {#each table.columns as c (c)}
                <th><button onclick={() => sortBy(c)}>{c} {#if sortCol === c}{#if sortDir === 1}<ArrowUp size={11} />{:else}<ArrowDown size={11} />{/if}{/if}</button></th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each rows.slice(0, limit) as r (r.key)}
              <tr class:sel={selected === r.key} onclick={() => (selected = selected === r.key ? null : r.key)}>
                {#if table.keyColumn}<td class="mono">{r.key}</td>{/if}
                {#each table.columns as c (c)}
                  {@const t = cellText(r.record[c])}
                  <td title={t.length > 40 ? t : null}>{t}</td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
        {#if rows.length > limit}
          <div class="empty"><button class="link-btn" onclick={() => (limit += 1000)}>Show more ({(rows.length - limit).toLocaleString()} left)</button></div>
        {/if}
      </div>
      {#if selectedRow}
        <aside class="detail">
          <div class="row"><strong class="ellipsis grow">{cellText(selectedRow.record.Name ?? selectedRow.key)}</strong><button class="btn ghost small" onclick={() => (selected = null)}>Close</button></div>
          <JsonNode name={null} value={selectedRow.record} open={true} />
        </aside>
      {/if}
    </div>
  {:else if shown === 'tree'}
    <div class="tree"><JsonNode name={null} value={data} open={true} /></div>
  {:else}
    <div class="text mono-block">{raw.length > 2_000_000 ? `${raw.slice(0, 2_000_000)}\n… (truncated; use Open or Save as)` : raw}</div>
  {/if}
</div>

<style>
  .results {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
    flex: 1;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .bar input {
    max-width: 260px;
    height: 28px;
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
    height: 24px;
    padding: 0 10px;
    border-radius: 4px;
    font-size: 12.5px;
    color: var(--text-2);
  }
  .seg button.active {
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
  }
  .split {
    display: flex;
    gap: 8px;
    flex: 1;
    min-height: 0;
  }
  .table-wrap,
  .tree,
  .text,
  .detail {
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
  }
  .table-wrap {
    flex: 1;
    min-width: 0;
  }
  .detail {
    width: 380px;
    flex: none;
    padding: 8px;
  }
  .tree {
    flex: 1;
    padding: 6px 4px;
  }
  .text {
    flex: 1;
    padding: 10px 12px;
    user-select: text;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 12.5px;
  }
  th {
    position: sticky;
    top: 0;
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
    text-align: left;
    z-index: 1;
  }
  th button {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    border: 0;
    background: none;
    padding: 7px 10px;
    font-weight: 600;
    white-space: nowrap;
  }
  td {
    padding: 5px 10px;
    border-bottom: 1px solid var(--border);
    max-width: 320px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    user-select: text;
  }
  tbody tr {
    cursor: pointer;
  }
  tbody tr:hover {
    background: var(--surface-2);
  }
  tr.sel {
    background: var(--accent-soft) !important;
  }
  .mono {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--text-2);
  }
</style>
