<script lang="ts">
  import Help from './Help.svelte';

  let {
    checked = $bindable(),
    label,
    help = '',
    disabled = false,
    onchange,
  }: { checked?: boolean; label: string; help?: string; disabled?: boolean; onchange?: (v: boolean) => void } = $props();
</script>

<label class="toggle" class:disabled>
  <input type="checkbox" bind:checked {disabled} onchange={() => onchange?.(!!checked)} />
  <span class="track"><span class="thumb"></span></span>
  <span class="text">{label}</span>
  {#if help}<Help text={help} />{/if}
</label>

<style>
  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    user-select: none;
    font-size: 13px;
    min-height: 26px;
  }
  .toggle.disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .track {
    position: relative;
    flex: none;
    width: 32px;
    height: 18px;
    border-radius: 9px;
    background: var(--border-strong);
    transition: background 0.15s;
  }
  .thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 2px rgb(0 0 0 / 25%);
    transition: transform 0.15s;
  }
  input:checked + .track {
    background: var(--accent);
  }
  input:checked + .track .thumb {
    transform: translateX(14px);
  }
  input:focus-visible + .track {
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
</style>
