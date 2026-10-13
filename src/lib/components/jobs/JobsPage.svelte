<script lang="ts">
  import { openPath } from '@tauri-apps/plugin-opener';
  import {
    Ban,
    CircleCheck,
    CircleX,
    Clock,
    Copy,
    FolderOpen,
    FolderTree,
    LoaderCircle,
    Pencil,
    RotateCw,
    Square,
    Trash2,
    TriangleAlert,
    Wand2,
  } from '@lucide/svelte';
  import LogView from './LogView.svelte';
  import ResultsView from '$lib/components/results/ResultsView.svelte';
  import { cores } from '$lib/core.svelte';
  import { PHASE_LABEL } from '$lib/datatool/log';
  import { queue, type Job } from '$lib/jobs.svelte';
  import { app } from '$lib/state.svelte';
  import { formatBytes, formatDuration } from '$lib/util';

  let now = $state(Date.now());
  $effect(() => {
    if (!queue.active) return;
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });

  let job = $derived(queue.jobs.find((j) => j.id === app.selectedJob) ?? queue.active ?? queue.jobs[queue.jobs.length - 1]);
  let tab = $state<'result' | 'log'>('result');
  let hasResult = $derived(!!job && job.status === 'done' && !!(job.resultFile || job.stdoutFile));
  let shownTab = $derived(hasResult ? tab : 'log');

  function elapsed(j: Job): string {
    if (!j.startedAt) return '';
    return formatDuration((j.endedAt ?? now) - j.startedAt);
  }

  function useSuggestion(j: Job, query: string, suggestion: string) {
    const task = { ...j.task, queries: j.task.queries.map((q) => (q === query ? suggestion : q)) };
    if (!task.queries.includes(suggestion)) task.queries = task.queries.map((q) => (query.startsWith(q.split('|')[0]) ? suggestion : q));
    app.openMode(j.mode, task);
  }

  async function checkForUpdate() {
    app.page = 'settings';
    await cores.checkUpdates(true);
  }
</script>

<div class="jobs">
  <aside class="list card">
    <div class="list-head">
      <h2>Jobs</h2>
      <span class="spacer"></span>
      {#if queue.jobs.some((j) => j.status !== 'running' && j.status !== 'queued')}
        <button class="btn ghost small" onclick={() => queue.clearFinished()}>Clear finished</button>
      {/if}
    </div>
    <div class="items">
      {#each [...queue.jobs].reverse() as j (j.id)}
        <button class="item" class:active={job?.id === j.id} onclick={() => (app.selectedJob = j.id)}>
          <span class="icon {j.status}">
            {#if j.status === 'running'}<LoaderCircle size={16} class="spin" />
            {:else if j.status === 'done'}<CircleCheck size={16} />
            {:else if j.status === 'failed'}<CircleX size={16} />
            {:else if j.status === 'cancelled'}<Ban size={16} />
            {:else}<Clock size={16} />{/if}
          </span>
          <span class="grow">
            <span class="title ellipsis">{j.title}</span>
            <span class="sub tiny faint ellipsis">
              {#if j.status === 'running'}{j.step || PHASE_LABEL[j.phase]}
              {:else if j.status === 'queued'}Waiting
              {:else}{j.task.queries.join(' ') || j.mode}{/if}
            </span>
          </span>
          <span class="tiny faint">{elapsed(j)}</span>
        </button>
      {:else}
        <div class="empty">Nothing has run yet. Pick a mode on the left and press Run.</div>
      {/each}
    </div>
  </aside>

  {#if job}
    <section class="detail">
      <div class="head">
        <div class="grow">
          <h1>{job.title}</h1>
          <div class="row small muted wrap">
            <span class="badge {job.status === 'done' ? 'ok' : job.status === 'failed' ? 'danger' : job.status === 'running' ? 'accent' : ''}">{job.status}</span>
            {#if job.startedAt}<span>{elapsed(job)}</span>{/if}
            {#if job.kind === 'extract'}<span>· {job.files.toLocaleString()} files · {formatBytes(job.bytes)}</span>{/if}
            {#if job.errors}<span class="danger">· {job.errors} errors</span>{/if}
            {#if job.warnings}<span class="warn">· {job.warnings} warnings</span>{/if}
            {#if job.gameBuild}<span data-tip="Game version DataTool loaded">· game {job.gameBuild}</span>{/if}
          </div>
        </div>
        {#if job.status === 'running' || job.status === 'queued'}
          <button class="btn danger" onclick={() => queue.stop(job.id)}><Square size={14} /> Stop</button>
        {:else}
          <button class="btn" onclick={() => queue.retry(job.id)}><RotateCw size={14} /> Run again</button>
        {/if}
        <button class="btn" onclick={() => app.openMode(job.mode, job.task)} data-tip="Open this task in its mode page"><Pencil size={14} /> Edit</button>
        {#if job.output}
          <button
            class="btn"
            data-tip="Browse with previews in this app"
            onclick={() => {
              app.browsePath = job.output!;
              app.page = 'files';
            }}><FolderTree size={14} /> Browse</button
          >
          <button class="btn" onclick={() => openPath(job.output!)}><FolderOpen size={14} /> Open folder</button>
        {/if}
        {#if job.status !== 'running'}
          <button class="btn ghost icon" aria-label="Remove job" data-tip="Remove from the list" onclick={() => queue.remove(job.id)}><Trash2 size={15} /></button>
        {/if}
      </div>

      {#if job.status === 'running'}
        <div class="live card">
          <div class="row">
            <LoaderCircle size={16} class="spin" />
            <strong>{PHASE_LABEL[job.phase]}</strong>
            {#if job.step}<span class="muted ellipsis">{job.step}</span>{/if}
          </div>
          {#if job.detail}<div class="tiny faint ellipsis">{job.detail}</div>{/if}
          <div class="progress indeterminate"><div></div></div>
        </div>
      {/if}

      {#if job.error && job.status === 'failed' && !job.diagnosis.length}
        <div class="notice danger"><CircleX size={16} /><span>{job.error}</span></div>
      {/if}
      {#each job.diagnosis as d (d.title)}
        <div class="notice {d.kind === 'query' || d.kind === 'language' ? 'warn' : 'danger'}">
          <TriangleAlert size={16} />
          <div class="grow col" style="gap: 4px">
            <strong>{d.title}</strong>
            {#if d.detail}<span class="small">{d.detail}</span>{/if}
            {#each d.suggestions ?? [] as s (s.query)}
              <div class="row small wrap">
                <span>Did you mean <code>{s.suggestion}</code>?</span>
                <button class="btn small" onclick={() => useSuggestion(job, s.query, s.suggestion)}><Wand2 size={13} /> Use it</button>
              </div>
            {/each}
            {#if d.kind === 'update'}
              <div><button class="btn small primary" onclick={checkForUpdate}>Check for a DataTool update</button></div>
            {/if}
          </div>
        </div>
      {/each}

      <div class="cmd row">
        <code class="mono-block grow">{job.command}</code>
        <button class="btn ghost icon small" aria-label="Copy command" data-tip="Copy command" onclick={() => navigator.clipboard.writeText(job.command)}><Copy size={13} /></button>
      </div>

      {#if hasResult}
        <div class="tabs">
          <button class:active={shownTab === 'result'} onclick={() => (tab = 'result')}>Result</button>
          <button class:active={shownTab === 'log'} onclick={() => (tab = 'log')}>Log</button>
        </div>
      {/if}
      {#if shownTab === 'result' && hasResult}
        <ResultsView path={(job.resultFile ?? job.stdoutFile)!} kind={job.resultFile ? 'json' : 'text'} />
      {:else}
        <LogView lines={job.lines} dropped={job.dropped} />
      {/if}
    </section>
  {:else}
    <section class="detail empty">Run something to see its progress and log here.</section>
  {/if}
</div>

<style>
  .jobs {
    display: flex;
    gap: 12px;
    height: 100%;
    min-height: 0;
  }
  .list {
    width: 290px;
    flex: none;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .list-head {
    display: flex;
    align-items: center;
    padding: 12px 12px 8px;
  }
  .items {
    overflow: auto;
    padding: 0 6px 6px;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px;
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    text-align: left;
  }
  .item:hover {
    background: var(--surface-3);
  }
  .item.active {
    background: var(--accent-soft);
  }
  .item .grow {
    display: flex;
    flex-direction: column;
  }
  .title {
    font-weight: 600;
    font-size: 13px;
  }
  .icon {
    display: inline-flex;
    color: var(--text-3);
  }
  .icon.running {
    color: var(--accent);
  }
  .icon.done {
    color: var(--ok);
  }
  .icon.failed {
    color: var(--danger);
  }
  .detail {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
  }
  .head {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }
  .head h1 {
    font-size: 19px;
    margin-bottom: 4px;
  }
  .danger {
    color: var(--danger);
  }
  .warn {
    color: var(--warn);
  }
  .live {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px 14px;
  }
  .cmd code {
    padding: 6px 10px;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text-2);
    max-height: 64px;
    overflow: auto;
    user-select: text;
  }
  .tabs {
    display: flex;
    gap: 4px;
    border-bottom: 1px solid var(--border);
  }
  .tabs button {
    border: 0;
    background: none;
    padding: 6px 12px;
    font-weight: 600;
    color: var(--text-2);
    border-bottom: 2px solid transparent;
  }
  .tabs button.active {
    color: var(--text);
    border-bottom-color: var(--accent);
  }
</style>
