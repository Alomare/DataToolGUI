<script lang="ts">
  // All queries of a task. Modes whose queries are plain names (maps, heroes
  // for voice lines, sprays...) get one picker; modes with types (hero
  // cosmetics, NPCs) get a builder per query. Either can be edited as text.
  import { untrack } from 'svelte';
  import { Code, LoaderCircle, Plus, RefreshCw, Trash2, Wand2 } from '@lucide/svelte';
  import ChipPicker from '$lib/components/ui/ChipPicker.svelte';
  import Help from '$lib/components/ui/Help.svelte';
  import QueryBuilder from './QueryBuilder.svelte';
  import { choices } from '$lib/choices.svelte';
  import { cores } from '$lib/core.svelte';
  import type { TaskForm } from '$lib/datatool/args';
  import { choicesFor, labelFor } from '$lib/datatool/choices';
  import { MODE_EXTRAS } from '$lib/datatool/extras';
  import { nameProblem, queryProblems } from '$lib/datatool/query';
  import type { Mode } from '$lib/datatool/schema';
  import { app } from '$lib/state.svelte';
  import { relativeTime } from '$lib/util';

  let { task, mode }: { task: TaskForm; mode: Mode } = $props();

  let query = $derived(mode.query!);
  let extra = $derived(MODE_EXTRAS[mode.keyword] ?? {});
  let simple = $derived(query.types.length === 0);
  let asText = $state(false);
  let text = $state('');

  // Names come from the game; load them (from cache, or by asking DataTool)
  // when a mode with a picker is opened.
  $effect(() => {
    const key = choices.key;
    if (key && query.choicesKey) untrack(() => void choices.ensure(app.prefs.autoLoadChoices));
  });

  function openText() {
    text = task.queries.join('\n');
    asText = true;
  }

  function closeText() {
    task.queries = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    asText = false;
  }

  let typeNames = $derived(query.types.map((t) => t.name));
  let problems = $derived(task.queries.flatMap((q) => queryProblems(q, typeNames).map((p) => `${q}: ${p}`)));
  let simpleOptions = $derived([{ value: '*', label: 'Everything (*)' }, ...choicesFor(choices.data, query.choicesKey)]);
</script>

<section class="panel">
  <header>
    <h2>What to {mode.kind === 'extract' ? 'extract' : 'include'}</h2>
    <Help text='Names are matched exactly as they appear in-game, in the text language DataTool loads. "*" means everything; prefix a name with ! to exclude it.' />
    <span class="spacer"></span>
    {#if query.choicesKey}
      {#if choices.loading}
        <span class="tiny faint row"><LoaderCircle size={13} class="spin" /> Reading names from the game…</span>
      {:else if choices.data && !choices.stale}
        <span class="tiny faint" data-tip="Hero, unlock and map names for the pickers, read from your game files">Names from {relativeTime(choices.loadedAt)}</span>
        <button class="btn ghost icon small" aria-label="Reload names" data-tip="Read names from the game again" onclick={() => choices.reload()}>
          <RefreshCw size={13} />
        </button>
      {:else if cores.active && app.prefs.game}
        <button class="btn small" onclick={() => choices.reload()} data-tip="Read hero, unlock and map names from your game files for the pickers (about 10 seconds)">
          <Wand2 size={13} /> Load names from the game
        </button>
      {/if}
    {/if}
    <button class="btn small" class:primary={asText} onclick={() => (asText ? closeText() : openText())} data-tip="Edit the queries as text, one per line">
      <Code size={13} /> Text
    </button>
  </header>

  {#if choices.error && query.choicesKey}
    {@const outdated = /does not support this version/i.test(choices.error)}
    <div class="notice warn small" style="margin-bottom: 10px">
      <span class="grow">
        {#if outdated}
          This DataTool build doesn't support your game version, so it can't read names from it (or extract anything).
        {:else}
          Couldn't read names from the game: {choices.error.replace(/^\[\w+\]\s*/, '').replace(/\.+$/, '')}.
        {/if}
        You can still type names.
      </span>
      {#if outdated}
        <button
          class="btn small"
          onclick={() => {
            app.page = 'settings';
            void cores.checkUpdates(true);
          }}>Update DataTool</button
        >
      {/if}
    </div>
  {/if}

  {#if asText}
    <textarea
      class="mono"
      rows="5"
      bind:value={text}
      spellcheck="false"
      placeholder={extra.queryPlaceholder ?? (simple ? 'One name per line' : 'Hero|type=item')}
      onblur={closeText}
    ></textarea>
    <p class="tiny faint" style="margin-top: 6px">
      One query per line. Format: <code>{simple ? 'name' : 'hero|type=(tag=value),item,!excluded|type=…'}</code>
    </p>
  {:else if simple}
    <ChipPicker
      bind:values={task.queries}
      options={simpleOptions}
      placeholder={extra.queryPlaceholder ?? (query.required ? 'Pick names, or * for everything' : 'Leave empty for everything')}
      labelFor={(v) => (v === '*' ? 'Everything' : labelFor(choices.data, query.choicesKey, v))}
      problem={(v) => nameProblem(v, true)}
    />
    {#if !task.queries.length && !query.required}
      <p class="tiny faint" style="margin-top: 6px">Empty: everything is extracted.</p>
    {/if}
  {:else}
    <div class="queries">
      {#each task.queries as _, i (i)}
        <div class="query">
          <div class="grow">
            <QueryBuilder bind:value={task.queries[i]} {query} data={choices.data} />
          </div>
          <button class="btn ghost icon small" aria-label="Remove query" data-tip="Remove this query" onclick={() => task.queries.splice(i, 1)}>
            <Trash2 size={14} />
          </button>
        </div>
      {/each}
      <div class="row">
        <button class="btn small" onclick={() => task.queries.push(query.types.length ? `*|${query.types[0].name}=*` : '*')}>
          <Plus size={14} /> Add query
        </button>
        {#if !task.queries.length}
          <span class="tiny faint">{query.required ? 'Add at least one query.' : 'No query: everything.'}</span>
        {/if}
      </div>
    </div>
  {/if}

  {#if extra.examples?.length}
    <div class="row wrap examples">
      <span class="tiny faint">Examples:</span>
      {#each extra.examples as ex (ex)}
        <button class="code-pill ex" onclick={() => (task.queries = [...task.queries, ex])} data-tip="Add this query">{ex}</button>
      {/each}
    </div>
  {/if}

  {#if problems.length}
    <div class="notice danger small" style="margin-top: 10px">
      <div>{#each problems as p (p)}<div>{p}</div>{/each}</div>
    </div>
  {/if}
</section>

<style>
  .queries {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .query {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    padding-bottom: 12px;
    border-bottom: 1px dashed var(--border);
  }
  textarea {
    font-family: var(--mono);
    font-size: 12.5px;
  }
  .examples {
    margin-top: 10px;
    gap: 6px;
  }
  .ex {
    border: 0;
    cursor: pointer;
  }
  .ex:hover {
    background: var(--accent-soft);
    color: var(--accent);
  }
</style>
