<script lang="ts">
  import {
    AudioLines,
    Bookmark,
    Box,
    CircleCheck,
    Download,
    Image,
    LoaderCircle,
    Map as MapIcon,
    MessagesSquare,
    Music,
    Play,
    Shirt,
    Table,
    Trash2,
    TriangleAlert,
    UserRound,
  } from '@lucide/svelte';
  import GamesPanel from './settings/GamesPanel.svelte';
  import PathInput from './ui/PathInput.svelte';
  import * as backend from '$lib/backend';
  import { cores, gameBuildNumber, releaseAsset } from '$lib/core.svelte';
  import { emptyTask, type TaskForm } from '$lib/datatool/args';
  import { queue } from '$lib/jobs.svelte';
  import { app } from '$lib/state.svelte';
  import { formatBytes, formatDate, relativeTime } from '$lib/util';

  interface Quick {
    label: string;
    hint: string;
    icon: typeof Shirt;
    task: Partial<TaskForm> & { mode: string };
  }

  const QUICK: Quick[] = [
    { label: 'Hero skins', hint: 'Models & textures of chosen skins', icon: Shirt, task: { mode: 'extract-unlocks', queries: ['|skin=*'] } },
    { label: 'Voice lines', hint: 'All lines of a hero', icon: AudioLines, task: { mode: 'extract-hero-voice' } },
    { label: 'Conversations', hint: 'Hero-to-hero dialogue', icon: MessagesSquare, task: { mode: 'extract-conversations' } },
    { label: 'Maps for Blender', hint: 'Geometry, props, lights', icon: MapIcon, task: { mode: 'extract-maps' } },
    { label: 'Sprays', hint: 'Every spray, or a few', icon: Image, task: { mode: 'extract-sprays' } },
    { label: 'Player icons', hint: 'Every icon, or a few', icon: UserRound, task: { mode: 'extract-player-icons' } },
    { label: 'Music', hint: 'Every music track', icon: Music, task: { mode: 'extract-music' } },
    { label: 'Hero data', hint: 'Heroes, abilities, stats', icon: Table, task: { mode: 'list-heroes' } },
    { label: 'Unlock list', hint: 'Every cosmetic, as a table', icon: Box, task: { mode: 'list-unlocks' } },
  ];

  function start(q: Quick) {
    const existing = app.tasks[q.task.mode];
    // Keep what the user already set up for that mode; only seed empty forms.
    const seeded = existing && (existing.queries.length || Object.keys(existing.flags).length) ? existing : { ...emptyTask(q.task.mode), ...q.task };
    app.openMode(q.task.mode, { ...seeded, output: seeded.output || app.prefs.outputDir });
  }

  let installError = $state('');
  async function installLatest() {
    installError = '';
    try {
      if (!cores.latest) await cores.checkUpdates(true);
      if (!cores.latest) throw new Error(cores.releasesError || 'No DataTool release found');
      await cores.install(cores.latest);
      app.notify(`DataTool ${cores.latest.tag_name} is ready`, 'success');
    } catch (e) {
      installError = backend.errorText(e);
    }
  }

  let needsCore = $derived(cores.checked && !cores.active);
  let needsGame = $derived(!app.prefs.game);
  let gameAhead = $derived(!!app.game?.build && !!cores.supportsGame && gameBuildNumber(app.game.build) > gameBuildNumber(cores.supportsGame));
  let modeLabel = (k: string) => cores.schema.modes.find((m) => m.keyword === k)?.label ?? k;
  let taskSummary = (t: TaskForm) => t.queries.join('  ') || (t.listOutput && t.mode.startsWith('list-') ? '' : t.output);
</script>

<div class="home">
  {#if needsCore || needsGame}
    <section class="panel setup">
      <header><h2>Get started</h2></header>
      <ol>
        <li class:done={!needsCore}>
          <div class="step-head">
            {#if needsCore}<span class="num">1</span>{:else}<CircleCheck size={20} />{/if}
            <strong>Install DataTool</strong>
          </div>
          {#if needsCore}
            <p class="small muted">DataTool reads the game files; this app drives it. It's downloaded into the app's folder{cores.latest ? ` (${cores.latest.tag_name}, ${formatBytes(releaseAsset(cores.latest)!.size)})` : ''}.</p>
            {#if cores.installing}
              {@const i = cores.installing}
              <div class="row">
                <LoaderCircle size={14} class="spin" />
                <div class="progress grow" class:indeterminate={i.stage === 'extract' || !i.total}><div style:width="{i.total ? (i.received / i.total) * 100 : 0}%"></div></div>
                <span class="tiny muted">{i.stage === 'download' ? formatBytes(i.received) : 'Unpacking…'}</span>
              </div>
            {:else}
              <div class="row">
                <button class="btn primary" onclick={installLatest}><Download size={15} /> Install the latest DataTool</button>
                <button class="btn" onclick={() => (app.page = 'settings')}>Other options</button>
              </div>
            {/if}
            {#if installError}<p class="small err">{installError}</p>{/if}
          {:else}
            <p class="small muted">{cores.activeVersion}</p>
          {/if}
        </li>
        <li class:done={!needsGame}>
          <div class="step-head">
            {#if needsGame}<span class="num">2</span>{:else}<CircleCheck size={20} />{/if}
            <strong>Choose your Overwatch install</strong>
          </div>
          <GamesPanel compact />
        </li>
        <li class:done={!!app.prefs.outputDir}>
          <div class="step-head">
            {#if !app.prefs.outputDir}<span class="num">3</span>{:else}<CircleCheck size={20} />{/if}
            <strong>Pick where extracted files go</strong>
          </div>
          <PathInput bind:value={app.prefs.outputDir} mode="directory" placeholder="Output folder" />
        </li>
      </ol>
    </section>
  {:else}
    <div class="status">
      <div class="stat card">
        <span class="tiny faint">DataTool</span>
        <strong>{cores.activeVersion ?? '—'}</strong>
        <span class="small muted">{cores.supportsGame ? `for Overwatch ${cores.supportsGame}` : cores.active?.dir}</span>
      </div>
      <div class="stat card">
        <span class="tiny faint">Overwatch</span>
        <strong>{app.game?.label ?? 'Overwatch'} {app.game?.build ? `· ${app.game.build}` : ''}</strong>
        <span class="small muted ellipsis" data-tip={app.prefs.game}>{app.prefs.game}</span>
      </div>
      <div class="stat card">
        <span class="tiny faint">Jobs</span>
        <strong>{queue.active ? `Running: ${queue.active.title}` : queue.pending ? `${queue.pending} queued` : 'Idle'}</strong>
        <button class="link-btn small" onclick={() => (app.page = 'jobs')}>{queue.jobs.length ? `${queue.jobs.length} this session` : 'Open jobs'}</button>
      </div>
    </div>
    {#if cores.update && app.prefs.skippedRelease !== cores.update.tag_name}
      {@const u = cores.update}
      <div class="notice warn update">
        <Download size={16} />
        <div class="grow">
          <strong>DataTool {u.tag_name} is available</strong>
          <div class="small">Released {formatDate(u.published_at)}. {u.body?.split('\n')[0]?.replace(/[*-]/g, '').trim()}</div>
        </div>
        {#if cores.installing}
          <span class="small"><LoaderCircle size={14} class="spin" /> Installing…</span>
        {:else}
          <button class="btn primary small" onclick={() => cores.install(u).then(() => app.notify(`Updated to ${u.tag_name}`, 'success')).catch((e) => app.notify(backend.errorText(e), 'error'))}>Update</button>
          <button class="btn ghost small" onclick={() => (app.prefs.skippedRelease = u.tag_name)}>Skip</button>
        {/if}
      </div>
    {/if}
    {#if gameAhead && !cores.update}
      <div class="notice warn">
        <TriangleAlert size={16} />
        <span class="small">Overwatch was updated ({app.game?.build}) after this DataTool release ({cores.supportsGame}). If extractions fail, wait for a new DataTool release — the app checks for it on start.</span>
      </div>
    {/if}
  {/if}

  <section>
    <h2 class="h">Quick start</h2>
    <div class="quick">
      {#each QUICK as q (q.label)}
        {@const Icon = q.icon}
        <button class="tile card" onclick={() => start(q)} disabled={!cores.schema.modes.some((m) => m.keyword === q.task.mode)}>
          <span class="tile-icon"><Icon size={20} /></span>
          <span class="grow">
            <strong>{q.label}</strong>
            <span class="tiny muted">{q.hint}</span>
          </span>
        </button>
      {/each}
    </div>
  </section>

  {#if app.presets.length}
    <section>
      <h2 class="h">Presets</h2>
      <div class="rows card">
        {#each app.presets as p (p.id)}
          <div class="line">
            <Bookmark size={15} />
            <button class="link-btn grow ellipsis" onclick={() => app.openMode(p.task.mode, p.task)}><strong>{p.name}</strong></button>
            <span class="tiny faint ellipsis summary">{modeLabel(p.task.mode)} · {taskSummary(p.task)}</span>
            <button class="btn small" onclick={() => { const r = queue.addTask(p.task); if (r.errors.length) app.openMode(p.task.mode, p.task); }}><Play size={13} /> Run</button>
            <button class="btn ghost icon small" aria-label="Delete preset" data-tip="Delete" onclick={() => app.deletePreset(p.id)}><Trash2 size={14} /></button>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  {#if app.history.length}
    <section>
      <h2 class="h">Recent</h2>
      <div class="rows card">
        {#each app.history.slice(0, 8) as h (h.id)}
          <button class="line hist" onclick={() => app.openMode(h.task.mode, h.task)}>
            <span class="badge {h.status === 'done' ? 'ok' : h.status === 'failed' ? 'danger' : ''}">{h.status}</span>
            <strong>{modeLabel(h.task.mode)}</strong>
            <span class="tiny faint ellipsis grow">{taskSummary(h.task)}</span>
            <span class="tiny faint">{relativeTime(h.at)}</span>
          </button>
        {/each}
      </div>
    </section>
  {/if}
</div>

<style>
  .home {
    display: flex;
    flex-direction: column;
    gap: 18px;
    max-width: 1080px;
    margin: 0 auto;
  }
  .setup ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .setup li {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-left: 34px;
  }
  .step-head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-left: -34px;
  }
  .num {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-text);
    font-weight: 700;
    font-size: 13px;
  }
  li.done .step-head {
    color: var(--ok);
  }
  li.done .step-head strong {
    color: var(--text);
  }
  .err {
    color: var(--danger);
  }
  .status {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }
  .stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 12px 14px;
    min-width: 0;
  }
  .stat strong {
    font-size: 15px;
  }
  .update {
    align-items: center;
  }
  .h {
    margin-bottom: 8px;
  }
  .quick {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: 10px;
  }
  .tile {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    text-align: left;
    transition: border-color 0.12s, transform 0.12s;
  }
  .tile:hover:not(:disabled) {
    border-color: var(--accent);
    transform: translateY(-1px);
  }
  .tile .grow {
    display: flex;
    flex-direction: column;
  }
  .tile-icon {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border-radius: 10px;
    background: var(--accent-soft);
    color: var(--accent);
    flex: none;
  }
  .rows {
    display: flex;
    flex-direction: column;
    padding: 4px;
  }
  .line {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px;
    border-radius: var(--radius-sm);
    border: 0;
    background: none;
    text-align: left;
    width: 100%;
  }
  .line:hover {
    background: var(--surface-2);
  }
  .line .link-btn {
    text-align: left;
    color: var(--text);
  }
  .summary {
    max-width: 45%;
  }
</style>
