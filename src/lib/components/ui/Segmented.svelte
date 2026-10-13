<script lang="ts" generics="T extends string">
  let {
    value = $bindable(),
    options,
    small = false,
    onchange,
  }: {
    value: T;
    options: { value: T; label: string; title?: string }[];
    small?: boolean;
    onchange?: (v: T) => void;
  } = $props();
</script>

<div class="seg" class:small role="radiogroup">
  {#each options as o (o.value)}
    <button
      type="button"
      role="radio"
      aria-checked={value === o.value}
      class:active={value === o.value}
      data-tip={o.title || null}
      onclick={() => {
        value = o.value;
        onchange?.(o.value);
      }}
    >
      {o.label}
    </button>
  {/each}
</div>

<style>
  .seg {
    display: inline-flex;
    padding: 2px;
    gap: 2px;
    border-radius: var(--radius-sm);
    background: var(--surface-3);
    border: 1px solid var(--border);
    max-width: 100%;
    flex-wrap: wrap;
  }
  button {
    border: 0;
    background: transparent;
    border-radius: 4px;
    height: 26px;
    padding: 0 10px;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-2);
    white-space: nowrap;
  }
  .small button {
    height: 22px;
    padding: 0 8px;
    font-size: 12px;
  }
  button:hover {
    color: var(--text);
  }
  button.active {
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
  }
</style>
