<script lang="ts">
  import { RotateCcw } from '@lucide/svelte';
  import Help from '$lib/components/ui/Help.svelte';
  import Toggle from '$lib/components/ui/Toggle.svelte';
  import type { FlagValue } from '$lib/datatool/args';
  import { FLAG_EXTRAS, LANGUAGES, flagLabel } from '$lib/datatool/extras';
  import type { Flag } from '$lib/datatool/schema';

  let {
    flag,
    value,
    /** Value used when this one isn't set (e.g. the app-wide setting). */
    inherited,
    inheritedLabel = 'default',
    onchange,
  }: {
    flag: Flag;
    value: FlagValue | undefined;
    inherited?: FlagValue;
    inheritedLabel?: string;
    /** `undefined` resets to the inherited/default value. */
    onchange: (v: FlagValue | undefined) => void;
  } = $props();

  let base = $derived(inherited ?? flag.default ?? (flag.type === 'boolean' ? false : ''));
  let effective = $derived(value ?? base);
  let changed = $derived(value !== undefined && String(value) !== String(base));
  let label = $derived(flagLabel(flag.name));
  let help = $derived([FLAG_EXTRAS[flag.name]?.help ?? flag.help, `--${flag.name}`].filter(Boolean).join('\n'));
  let isLanguage = $derived(flag.name === 'language' || flag.name === 'speech-language');
  let baseText = $derived(base === '' || base === null ? 'not set' : String(base));

  function set(v: FlagValue) {
    onchange(String(v) === String(base) ? undefined : v);
  }
</script>

<div class="flag" class:changed data-flag={flag.name}>
  {#if flag.type === 'boolean'}
    <Toggle checked={!!effective} {label} {help} onchange={(v) => set(v)} />
  {:else}
    <span class="name">{label} <Help text={help} /></span>
    {#if flag.choices?.length}
      <select value={String(effective ?? '')} onchange={(e) => set((e.currentTarget as HTMLSelectElement).value)}>
        {#if !flag.choices.includes(String(base))}<option value={String(base ?? '')}>{isLanguage ? 'Game\'s language' : `Default (${baseText})`}</option>{/if}
        {#each flag.choices as c (c)}
          <option value={c}>{isLanguage && LANGUAGES[c] ? `${LANGUAGES[c]} (${c})` : c}{c === String(base) ? ` · ${inheritedLabel}` : ''}</option>
        {/each}
      </select>
    {:else}
      <input
        type={flag.type === 'string' ? 'text' : 'number'}
        value={String(effective ?? '')}
        placeholder={base ? String(base) : 'not set'}
        spellcheck="false"
        onchange={(e) => set((e.currentTarget as HTMLInputElement).value)}
      />
    {/if}
  {/if}
  {#if changed}
    <button class="btn ghost icon small reset" aria-label="Reset {label}" data-tip="Back to {inheritedLabel} ({baseText})" onclick={() => onchange(undefined)}>
      <RotateCcw size={13} />
    </button>
  {/if}
</div>

<style>
  .flag {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 32px;
    padding: 2px 6px;
    margin: 0 -6px;
    border-radius: var(--radius-sm);
  }
  .flag.changed {
    background: var(--accent-soft);
  }
  .name {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 13px;
    white-space: nowrap;
  }
  select,
  input {
    flex: 1 1 110px;
    width: auto;
    min-width: 0;
    max-width: 240px;
    margin-left: auto;
    height: 28px;
  }
  .reset {
    margin-left: auto;
  }
  select + .reset,
  input + .reset {
    margin-left: 0;
  }
</style>
