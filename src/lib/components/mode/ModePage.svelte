<script lang="ts">
  import { openPath } from '@tauri-apps/plugin-opener';
  import { Bookmark, Check, Copy, FolderOpen, Play, RotateCcw, TriangleAlert } from '@lucide/svelte';
  import Field from '$lib/components/ui/Field.svelte';
  import Help from '$lib/components/ui/Help.svelte';
  import Modal from '$lib/components/ui/Modal.svelte';
  import PathInput from '$lib/components/ui/PathInput.svelte';
  import Segmented from '$lib/components/ui/Segmented.svelte';
  import Toggle from '$lib/components/ui/Toggle.svelte';
  import FlagsPanel from './FlagsPanel.svelte';
  import QueryEditor from './QueryEditor.svelte';
  import { cores } from '$lib/core.svelte';
  import { buildArgs, emptyTask, formatCommand, type ListOutput, type TaskForm } from '$lib/datatool/args';
  import { CATEGORIES, MODE_EXTRAS } from '$lib/datatool/extras';
  import type { Mode } from '$lib/datatool/schema';
  import { queue } from '$lib/jobs.svelte';
  import { app } from '$lib/state.svelte';
  import { joinPath } from '$lib/util';

  let { mode, task }: { mode: Mode; task: TaskForm } = $props();

  let extra = $derived(MODE_EXTRAS[mode.keyword] ?? {});
  let category = $derived(CATEGORIES.find((c) => c.id === mode.category));
  let built = $derived(
    buildArgs({
      schema: cores.schema,
      mode,
      task,
      game: app.prefs.game,
      globalFlags: app.prefs.globalFlags,
      resultFile: '<results>.json',
    }),
  );
  let command = $derived(formatCommand(cores.active?.exe ?? 'DataTool.exe', built.args));
  let copied = $state(false);
  let runErrors = $state<string[]>([]);
  let presetOpen = $state(false);
  let presetName = $state('');

  let listOptions = $derived<{ value: ListOutput; label: string; title?: string }[]>(
    mode.supportsJson
      ? [
          { value: 'view', label: 'Show in app', title: 'Browse the result as a table or tree' },
          { value: 'file', label: 'Save JSON', title: 'Write the JSON to a file you choose' },
          { value: 'text', label: 'Text', title: 'DataTool\'s plain text output' },
        ]
      : [{ value: 'text', label: 'Text' }],
  );

  async function copy() {
    await navigator.clipboard.writeText(command);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }

  function run() {
    runErrors = [];
    const r = queue.addTask(task);
    if (r.errors.length) {
      runErrors = r.errors;
      return;
    }
    if (mode.kind === 'extract' && task.output && !app.prefs.outputDir) app.prefs.outputDir = task.output;
    if (queue.pending > 1) app.notify(`Queued: ${mode.label} (${queue.pending - 1} ahead)`, 'info', { label: 'Jobs', run: () => (app.page = 'jobs') });
  }

  function savePreset() {
    if (!presetName.trim()) return;
    app.savePreset(presetName.trim(), task);
    presetOpen = false;
    app.notify(`Saved "${presetName.trim()}"`, 'success');
  }

  function reset() {
    const output = task.output;
    Object.assign(task, emptyTask(mode.keyword), { output });
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && cores.active && !built.errors.length) {
      e.preventDefault();
      run();
    }
  }}
/>

<div class="mode">
  <div class="page-head">
    <div class="grow">
      <div class="row tiny faint crumbs">
        <span>{category?.label ?? 'Mode'}</span>
        <span>›</span>
        <code class="code-pill">{mode.keyword}</code>
        {#each mode.aliases as a (a)}<code class="code-pill" data-tip="Alias">{a}</code>{/each}
      </div>
      <h1>{mode.label}</h1>
      <p class="muted">{mode.help || mode.description}</p>
    </div>
    <button class="btn ghost small" onclick={reset} data-tip="Clear queries and options"><RotateCcw size={14} /> Reset</button>
    <button
      class="btn small"
      onclick={() => {
        presetName = mode.label;
        presetOpen = true;
      }}
    >
      <Bookmark size={14} /> Save preset
    </button>
  </div>

  {#if mode.sensitive}
    <div class="notice warn small">
      <TriangleAlert size={16} />
      <span>This is an unlisted DataTool mode, meant for research and debugging. It can change or disappear between DataTool releases and may need specific arguments.</span>
    </div>
  {:else if cores.schema.fromLive && !mode.live}
    <div class="notice warn small"><TriangleAlert size={16} /><span>Your DataTool build doesn't report this mode.</span></div>
  {/if}

  {#if mode.query}
    <QueryEditor {task} {mode} />
  {/if}

  {#if mode.positionals}
    <section class="panel">
      <Field label={mode.positionals.label} help={mode.positionals.help}>
        <input type="text" bind:value={task.positionals} placeholder={mode.positionals.placeholder} spellcheck="false" />
      </Field>
    </section>
  {/if}

  <section class="panel">
    <header><h2>{mode.kind === 'list' ? 'Result' : 'Output'}</h2></header>
    {#if mode.kind === 'extract'}
      <Field
        label="Output folder"
        hint={extra.outputFolder ? `DataTool creates a "${extra.outputFolder}" folder inside it.` : 'DataTool creates its own sub-folders inside it.'}
      >
        <PathInput bind:value={task.output} mode="directory" placeholder="Where to save the files" defaultPath={app.prefs.outputDir} />
        {#if task.output}
          <button
            class="btn small icon"
            aria-label="Open output folder"
            data-tip="Open"
            onclick={() => openPath(extra.outputFolder ? joinPath(task.output, extra.outputFolder) : task.output).catch(() => openPath(task.output))}
          >
            <FolderOpen size={14} />
          </button>
        {/if}
      </Field>
    {:else if mode.kind === 'list'}
      <div class="col">
        <Segmented bind:value={task.listOutput} options={listOptions} />
        {#if task.listOutput === 'file' && mode.supportsJson}
          <Field label="JSON file">
            <PathInput bind:value={task.listFile} mode="save" filters={[{ name: 'JSON', extensions: ['json'] }]} placeholder="Where to save the JSON" />
          </Field>
        {:else if task.listOutput === 'text' || !mode.supportsJson}
          <Toggle bind:checked={task.simplify} label="Simplified" help="Print less detail" />
        {/if}
      </div>
    {:else}
      <p class="small muted">This mode writes no files of its own; its log appears in Jobs.</p>
    {/if}
  </section>

  <FlagsPanel {task} {mode} />

  <section class="panel">
    <header>
      <h2>Command</h2>
      <Help text="The exact command this runs. Copy it to run DataTool yourself in a terminal." />
      <span class="spacer"></span>
      <button class="btn ghost small" onclick={copy}>
        {#if copied}<Check size={13} /> Copied{:else}<Copy size={13} /> Copy{/if}
      </button>
    </header>
    <div class="mono-block cmd">{command}</div>
    <div style="margin-top: 10px">
      <Field label="Extra arguments" help="Appended to the command as-is, for anything this page doesn't cover.">
        <input type="text" bind:value={task.extraArgs} placeholder="--flag=value" spellcheck="false" class="mono" />
      </Field>
    </div>
  </section>

  <div class="runbar card">
    <div class="grow small">
      {#if runErrors.length || built.errors.length}
        <span class="err">{(runErrors.length ? runErrors : built.errors)[0]}</span>
      {:else if built.warnings.length}
        <span class="warn">{built.warnings[0]}</span>
      {:else if queue.active}
        <span class="muted">{queue.active.title} is running; this will start after it.</span>
      {:else}
        <span class="muted">Ready{app.game ? ` · ${app.game.label} (${app.game.path})` : ''}</span>
      {/if}
    </div>
    <button class="btn primary large" onclick={run} disabled={!cores.active || built.errors.length > 0}>
      <Play size={16} /> {queue.active ? 'Queue' : 'Run'} <span class="kbd shortcut">Ctrl+Enter</span>
    </button>
  </div>
</div>

<Modal bind:open={presetOpen} title="Save as preset">
  <Field label="Name">
    <!-- svelte-ignore a11y_autofocus -->
    <input type="text" bind:value={presetName} autofocus onkeydown={(e) => e.key === 'Enter' && savePreset()} />
  </Field>
  <p class="small muted">Saves this mode with its queries, output and options. Find presets on the Home page.</p>
  {#snippet footer()}
    <button class="btn" onclick={() => (presetOpen = false)}>Cancel</button>
    <button class="btn primary" onclick={savePreset} disabled={!presetName.trim()}>Save</button>
  {/snippet}
</Modal>

<style>
  .mode {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 1080px;
    margin: 0 auto;
    padding-bottom: 8px;
  }
  .page-head {
    margin-bottom: 2px;
  }
  .crumbs {
    margin-bottom: 4px;
    gap: 6px;
  }
  h1 {
    margin-bottom: 4px;
  }
  .cmd {
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    border: 1px solid var(--border);
    user-select: text;
  }
  .runbar {
    position: sticky;
    bottom: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px 10px 16px;
    box-shadow: var(--shadow-lg);
  }
  .err {
    color: var(--danger);
  }
  .shortcut {
    background: color-mix(in srgb, currentColor 18%, transparent);
    color: inherit;
    opacity: 0.85;
  }
  .warn {
    color: var(--warn);
  }
  .mono {
    font-family: var(--mono);
    font-size: 12.5px;
  }
</style>
