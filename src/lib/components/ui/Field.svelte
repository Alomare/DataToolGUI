<script lang="ts">
  import type { Snippet } from 'svelte';
  import Help from './Help.svelte';

  let {
    label,
    help = '',
    hint = '',
    error = '',
    inline = false,
    children,
  }: { label: string; help?: string; hint?: string; error?: string; inline?: boolean; children: Snippet } = $props();
</script>

<label class="field" class:inline>
  <!-- Clicking the text must not "click" the first control inside (e.g. a
       segmented button), so stop the label's default activation. -->
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <span class="label" onclick={(e) => e.preventDefault()}>
    {label}
    {#if help}<Help text={help} />{/if}
  </span>
  <span class="control">{@render children()}</span>
  {#if error}
    <span class="error">{error}</span>
  {:else if hint}
    <span class="hint">{hint}</span>
  {/if}
</label>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }
  .field.inline {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .label {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text-2);
  }
  .control {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .hint {
    font-size: 11.5px;
    color: var(--text-3);
  }
  .error {
    font-size: 11.5px;
    color: var(--danger);
  }
</style>
