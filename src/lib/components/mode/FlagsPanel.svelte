<script lang="ts">
  // A mode's options, grouped into sections. General flags (language, region)
  // default to the app-wide settings and can be overridden per task.
  import { ChevronRight, Eye, EyeOff } from '@lucide/svelte';
  import FlagControl from './FlagControl.svelte';
  import { cores } from '$lib/core.svelte';
  import { LIST_OUTPUT_FLAGS, type TaskForm } from '$lib/datatool/args';
  import { FLAG_SECTIONS, MODE_EXTRAS, flagSection } from '$lib/datatool/extras';
  import type { Flag, Mode } from '$lib/datatool/schema';
  import { app } from '$lib/state.svelte';

  let { task, mode }: { task: TaskForm; mode: Mode } = $props();

  interface Section {
    id: string;
    label: string;
    flags: Flag[];
  }

  let sections = $derived.by<Section[]>(() => {
    const schema = cores.schema;
    const group = mode.flagGroup ? schema.groups[mode.flagGroup] : undefined;
    const all = [...(group?.flags ?? []), ...schema.global.flags].filter(
      (f) => (app.prefs.showAdvanced || !f.hidden) && !(mode.kind === 'list' && LIST_OUTPUT_FLAGS.has(f.name)),
    );
    const preferred = MODE_EXTRAS[mode.keyword]?.sections ?? [];
    const order = [...preferred, ...FLAG_SECTIONS.map((s) => s.id).filter((s) => !preferred.includes(s))];
    return order
      .map((id) => ({
        id,
        label: FLAG_SECTIONS.find((s) => s.id === id)?.label ?? id,
        flags: all.filter((f) => flagSection(f.name) === id),
      }))
      .filter((s) => s.flags.length);
  });

  let hiddenCount = $derived.by(() => {
    const group = mode.flagGroup ? cores.schema.groups[mode.flagGroup] : undefined;
    return [...(group?.flags ?? []), ...cores.schema.global.flags].filter((f) => f.hidden).length;
  });

  let changedCount = $derived(Object.keys(task.flags).length);

  /** Sections open by default: the mode's main ones and any with changes. */
  let openSections = $state<Record<string, boolean>>({});
  function isOpen(s: Section, i: number): boolean {
    if (s.id in openSections) return openSections[s.id];
    const preferred = MODE_EXTRAS[mode.keyword]?.sections ?? [];
    return preferred.includes(s.id) || (!preferred.length && i < 2) || s.flags.some((f) => f.name in task.flags);
  }

  function setFlag(name: string, v: string | boolean | undefined) {
    if (v === undefined) delete task.flags[name];
    else task.flags[name] = v;
  }

  const isGlobal = (f: Flag) => f.group === 'ToolFlags';
</script>

<section class="panel">
  <header>
    <h2>Options</h2>
    {#if changedCount}<span class="badge accent">{changedCount} changed</span>{/if}
    <span class="spacer"></span>
    {#if changedCount}
      <button class="btn ghost small" onclick={() => (task.flags = {})}>Reset all</button>
    {/if}
    {#if hiddenCount}
      <button
        class="btn ghost small"
        onclick={() => (app.prefs.showAdvanced = !app.prefs.showAdvanced)}
        data-tip="Options DataTool doesn't list in its help: debugging, raw output, voice grouping…"
      >
        {#if app.prefs.showAdvanced}<EyeOff size={13} /> Hide{:else}<Eye size={13} /> Show{/if} advanced ({hiddenCount})
      </button>
    {/if}
  </header>

  {#each sections as s, i (s.id)}
    {@const open = isOpen(s, i)}
    <div class="section">
      <button class="sec-head" aria-expanded={open} onclick={() => (openSections[s.id] = !open)}>
        <span class="chev" class:open><ChevronRight size={14} /></span>
        <span>{s.label}</span>
        {#if s.flags.some((f) => f.name in task.flags)}<span class="dot"></span>{/if}
        <span class="tiny faint">{s.flags.length}</span>
      </button>
      {#if open}
        <div class="flags">
          {#each s.flags as f (f.name)}
            <FlagControl
              flag={f}
              value={task.flags[f.name]}
              inherited={isGlobal(f) ? app.prefs.globalFlags[f.name] : undefined}
              inheritedLabel={isGlobal(f) && f.name in app.prefs.globalFlags ? 'from Settings' : 'default'}
              onchange={(v) => setFlag(f.name, v)}
            />
          {/each}
        </div>
      {/if}
    </div>
  {/each}
  {#if !sections.length}<p class="tiny faint">This mode has no options.</p>{/if}
</section>

<style>
  .section + .section {
    border-top: 1px solid var(--border);
  }
  .sec-head {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 8px 0;
    border: 0;
    background: none;
    font-weight: 600;
    font-size: 13px;
    text-align: left;
  }
  .chev {
    display: inline-flex;
    color: var(--text-3);
    transition: transform 0.12s;
  }
  .chev.open {
    transform: rotate(90deg);
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
  }
  .flags {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 2px 28px;
    padding: 0 0 10px 20px;
  }
</style>
