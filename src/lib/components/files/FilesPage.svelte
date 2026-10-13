<script lang="ts">
  // Browse extracted files with previews for images, sounds and text.
  import { convertFileSrc } from '@tauri-apps/api/core';
  import { openPath, revealItemInDir } from '@tauri-apps/plugin-opener';
  import { ArrowUp, ExternalLink, File, FileAudio, FileImage, FileText, Folder, FolderOpen, LayoutGrid, List, RefreshCw } from '@lucide/svelte';
  import PathInput from '$lib/components/ui/PathInput.svelte';
  import * as backend from '$lib/backend';
  import type { DirEntry } from '$lib/backend';
  import { app } from '$lib/state.svelte';
  import { dirname, extname, formatBytes } from '$lib/util';

  const IMAGE = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'tif', 'tiff'];
  const BROWSER_IMAGE = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];
  const AUDIO = ['ogg', 'wav', 'mp3', 'opus', 'flac'];
  const VIDEO = ['mp4', 'webm'];
  const TEXT = ['txt', 'json', 'csv', 'xml', 'log'];

  let entries = $state<DirEntry[]>([]);
  let error = $state('');
  let loading = $state(false);
  let selected = $state<DirEntry | null>(null);
  let text = $state<string | null>(null);
  let grid = $state(false);
  let filter = $state('');
  let limit = $state(400);

  let path = $derived(app.browsePath || app.prefs.outputDir);
  let crumbs = $derived.by(() => {
    const parts = path.split(/[\\/]/).filter(Boolean);
    return parts.map((p, i) => ({ name: p, path: parts.slice(0, i + 1).join('\\') + (i === 0 && /:$/.test(p) ? '\\' : '') }));
  });
  let shown = $derived(filter ? entries.filter((e) => e.name.toLowerCase().includes(filter.toLowerCase())) : entries);
  let images = $derived(shown.filter((e) => !e.isDir && BROWSER_IMAGE.includes(extname(e.name))).length);

  $effect(() => {
    const p = path;
    if (!p) return;
    load(p);
  });

  async function load(p: string) {
    loading = true;
    error = '';
    selected = null;
    limit = 400;
    try {
      entries = await backend.listDir(p);
      // Folders full of images read best as a grid.
      grid = entries.filter((e) => BROWSER_IMAGE.includes(extname(e.name))).length > entries.length / 2;
    } catch (e) {
      entries = [];
      error = backend.errorText(e);
    } finally {
      loading = false;
    }
  }

  async function select(e: DirEntry) {
    if (e.isDir) {
      app.browsePath = e.path;
      filter = '';
      return;
    }
    selected = e;
    text = null;
    if (TEXT.includes(extname(e.name)) && e.size < 1_000_000) {
      text = await backend.readText(e.path).catch(() => null);
    }
  }

  function icon(e: DirEntry) {
    if (e.isDir) return Folder;
    const x = extname(e.name);
    if (IMAGE.includes(x)) return FileImage;
    if (AUDIO.includes(x) || x === 'wem') return FileAudio;
    if (TEXT.includes(x)) return FileText;
    return File;
  }
</script>

<div class="files">
  <div class="bar">
    <button class="btn icon small" aria-label="Up" data-tip="Up one folder" disabled={!path || crumbs.length <= 1} onclick={() => (app.browsePath = dirname(path))}><ArrowUp size={14} /></button>
    <div class="crumbs grow" data-tip={path}>
      {#each crumbs as c, i (c.path)}
        {#if i}<span class="faint">›</span>{/if}
        <button class="link-btn" onclick={() => (app.browsePath = c.path)}>{c.name}</button>
      {/each}
    </div>
    <input type="search" placeholder="Filter" bind:value={filter} />
    <button class="btn icon small" aria-label="Refresh" data-tip="Refresh" onclick={() => load(path)}><RefreshCw size={14} /></button>
    <button class="btn icon small" aria-label="Toggle view" data-tip={grid ? 'List' : 'Thumbnails'} onclick={() => (grid = !grid)}>
      {#if grid}<List size={14} />{:else}<LayoutGrid size={14} />{/if}
    </button>
    <button class="btn small" disabled={!path} onclick={() => openPath(path)}><FolderOpen size={14} /> Open in Explorer</button>
  </div>

  {#if !path}
    <div class="pick card">
      <p class="muted">Choose a folder to browse, such as your output folder.</p>
      <PathInput mode="directory" value="" onchange={(v) => (app.browsePath = v)} />
    </div>
  {:else}
    <div class="split">
      <div class="listing card" class:grid>
        {#if loading}
          <div class="empty">Loading…</div>
        {:else if error}
          <div class="notice danger small">{error}</div>
        {:else if !shown.length}
          <div class="empty">{entries.length ? 'Nothing matches the filter.' : 'This folder is empty.'}</div>
        {:else}
          {#each shown.slice(0, limit) as e (e.path)}
            {@const Icon = icon(e)}
            <button class="entry" class:sel={selected?.path === e.path} onclick={() => select(e)} ondblclick={() => !e.isDir && openPath(e.path)} title={e.name}>
              {#if grid && !e.isDir && BROWSER_IMAGE.includes(extname(e.name))}
                <img src={convertFileSrc(e.path)} alt="" loading="lazy" />
              {:else}
                <span class="ico" class:dir={e.isDir}><Icon size={grid ? 34 : 16} /></span>
              {/if}
              <span class="name ellipsis">{e.name}</span>
              {#if !grid}<span class="tiny faint size">{e.isDir ? '' : formatBytes(e.size)}</span>{/if}
            </button>
          {/each}
          {#if shown.length > limit}
            <button class="link-btn more" onclick={() => (limit += 1000)}>Show more ({(shown.length - limit).toLocaleString()} left)</button>
          {/if}
        {/if}
      </div>

      <aside class="preview card">
        {#if selected}
          {@const x = extname(selected.name)}
          <div class="pv-head">
            <strong class="ellipsis" title={selected.name}>{selected.name}</strong>
            <span class="tiny faint">{formatBytes(selected.size)} · {new Date(selected.modified).toLocaleString()}</span>
          </div>
          <div class="pv-body">
            {#if BROWSER_IMAGE.includes(x)}
              <img class="checker" src={convertFileSrc(selected.path)} alt={selected.name} />
            {:else if AUDIO.includes(x)}
              <audio controls autoplay src={convertFileSrc(selected.path)}></audio>
              {#if x === 'ogg'}<p class="tiny faint">Music is often Ogg Opus; if it doesn't play here, open it in foobar2000.</p>{/if}
            {:else if VIDEO.includes(x)}
              <!-- svelte-ignore a11y_media_has_caption -->
              <video controls src={convertFileSrc(selected.path)}></video>
            {:else if text !== null}
              <pre class="mono-block">{text}</pre>
            {:else}
              <p class="small muted">
                {#if ['owmdl', 'owmat', 'owmap', 'owentity', 'owanimclip', 'seanim'].includes(x)}
                  Overwatch model/map format: import it into Blender with the io_scene_owm add-on.
                {:else if x === 'dds' || x === 'tif' || x === 'tiff'}
                  This image format can't be previewed here. Open it in an image editor.
                {:else if x === 'wem' || x === 'bnk'}
                  Raw Wwise audio. Extract without "Raw sound" to get playable files.
                {:else}
                  No preview for this file type.
                {/if}
              </p>
            {/if}
          </div>
          <div class="row">
            <button class="btn small" onclick={() => openPath(selected!.path)}><ExternalLink size={13} /> Open</button>
            <button class="btn small" onclick={() => revealItemInDir(selected!.path)}><FolderOpen size={13} /> Show in folder</button>
            <button class="btn small ghost" onclick={() => navigator.clipboard.writeText(selected!.path)}>Copy path</button>
          </div>
        {:else}
          <div class="empty">
            {shown.length.toLocaleString()} items{images ? ` · ${images.toLocaleString()} images` : ''}<br />Select a file to preview it.
          </div>
        {/if}
      </aside>
    </div>
  {/if}
</div>

<style>
  .files {
    display: flex;
    flex-direction: column;
    gap: 10px;
    height: 100%;
    min-height: 0;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .bar input {
    width: 180px;
    height: 28px;
  }
  .crumbs {
    display: flex;
    align-items: center;
    /* Long paths lose their start, not the current folder. */
    justify-content: flex-end;
    gap: 4px;
    overflow: hidden;
    white-space: nowrap;
    font-size: 13px;
  }
  .pick {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 640px;
  }
  .split {
    display: flex;
    gap: 10px;
    flex: 1;
    min-height: 0;
  }
  .listing {
    flex: 1;
    min-width: 0;
    overflow: auto;
    padding: 4px;
  }
  .listing.grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    align-content: start;
    gap: 6px;
  }
  .entry {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 5px 8px;
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    text-align: left;
    font-size: 13px;
  }
  .grid .entry {
    flex-direction: column;
    gap: 4px;
    padding: 6px;
    height: 132px;
    justify-content: center;
  }
  .grid .entry img {
    width: 100%;
    height: 96px;
    object-fit: contain;
  }
  .grid .entry .name {
    width: 100%;
    text-align: center;
    font-size: 11.5px;
  }
  .entry:hover {
    background: var(--surface-3);
  }
  .entry.sel {
    background: var(--accent-soft);
  }
  .ico {
    display: inline-flex;
    color: var(--text-3);
  }
  .ico.dir {
    color: var(--accent);
  }
  .name {
    flex: 1;
    min-width: 0;
  }
  .size {
    white-space: nowrap;
  }
  .more {
    display: block;
    padding: 8px;
    grid-column: 1 / -1;
  }
  .preview {
    width: 380px;
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    overflow: hidden;
  }
  .pv-head {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .pv-body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .pv-body img,
  .pv-body video {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  .checker {
    background: repeating-conic-gradient(var(--surface-3) 0% 25%, var(--surface) 0% 50%) 50% / 16px 16px;
    border-radius: var(--radius-sm);
  }
  audio {
    width: 100%;
  }
  pre {
    margin: 0;
    font-size: 11.5px;
    user-select: text;
  }
</style>
