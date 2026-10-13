<script lang="ts">
  import type { Snippet } from 'svelte';
  import { X } from '@lucide/svelte';

  let {
    open = $bindable(false),
    title,
    width = 460,
    children,
    footer,
  }: { open?: boolean; title: string; width?: number; children: Snippet; footer?: Snippet } = $props();

  function onkeydown(e: KeyboardEvent) {
    if (open && e.key === 'Escape') open = false;
  }
</script>

<svelte:window {onkeydown} />

{#if open}
  <div class="backdrop" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) open = false; }}>
    <div class="modal card" role="dialog" aria-modal="true" aria-label={title} style:width="{width}px">
      <header>
        <h2>{title}</h2>
        <button class="btn ghost icon small" onclick={() => (open = false)} aria-label="Close"><X size={16} /></button>
      </header>
      <div class="body">{@render children()}</div>
      {#if footer}<footer>{@render footer()}</footer>{/if}
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 500;
    display: grid;
    place-items: center;
    background: rgb(10 12 16 / 45%);
    padding: 24px;
  }
  .modal {
    max-width: 100%;
    max-height: 100%;
    display: flex;
    flex-direction: column;
    box-shadow: var(--shadow-lg);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px 8px;
  }
  .body {
    padding: 8px 16px 16px;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--border);
  }
</style>
