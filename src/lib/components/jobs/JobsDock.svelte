<script lang="ts">
  // The running job, always in view at the bottom of the window.
  import { ChevronRight, LoaderCircle, Square } from '@lucide/svelte';
  import { PHASE_LABEL } from '$lib/datatool/log';
  import { queue } from '$lib/jobs.svelte';
  import { app } from '$lib/state.svelte';
  import { formatBytes, formatDuration } from '$lib/util';

  let now = $state(Date.now());
  $effect(() => {
    if (!queue.active) return;
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });

  let job = $derived(queue.active);
  let waiting = $derived(queue.jobs.filter((j) => j.status === 'queued').length);
</script>

{#if job && app.page !== 'jobs'}
  <div class="dock card">
    <LoaderCircle size={16} class="spin" />
    <div class="grow">
      <div class="row">
        <strong>{job.title}</strong>
        <span class="muted small ellipsis">{job.step || PHASE_LABEL[job.phase]}</span>
      </div>
      <div class="progress indeterminate"><div></div></div>
    </div>
    <span class="small muted stats">
      {formatDuration(now - (job.startedAt ?? now))}
      {#if job.kind === 'extract'} · {job.files.toLocaleString()} files · {formatBytes(job.bytes)}{/if}
      {#if waiting} · {waiting} queued{/if}
    </span>
    <button class="btn small danger" onclick={() => queue.stop(job.id)}><Square size={13} /> Stop</button>
    <button class="btn small" onclick={() => queue.show(job.id)}>Details <ChevronRight size={13} /></button>
  </div>
{/if}

<style>
  .dock {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    color: var(--accent);
  }
  .dock :global(strong),
  .stats {
    color: var(--text);
  }
  .dock .grow {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .stats {
    white-space: nowrap;
  }
</style>
