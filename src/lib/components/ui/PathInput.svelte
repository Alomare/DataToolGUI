<script lang="ts">
  import { open, save } from '@tauri-apps/plugin-dialog';
  import { FolderOpen, X } from '@lucide/svelte';

  let {
    value = $bindable(),
    mode = 'file',
    placeholder = '',
    filters = [],
    defaultPath = '',
    clearable = true,
    onchange,
  }: {
    value?: string;
    mode?: 'file' | 'directory' | 'save';
    placeholder?: string;
    filters?: { name: string; extensions: string[] }[];
    defaultPath?: string;
    clearable?: boolean;
    onchange?: (v: string) => void;
  } = $props();

  async function browse() {
    const start = value || defaultPath || undefined;
    const picked =
      mode === 'save'
        ? await save({ defaultPath: start, filters })
        : await open({ directory: mode === 'directory', multiple: false, defaultPath: start, filters: mode === 'file' ? filters : undefined });
    if (typeof picked === 'string') {
      value = picked;
      onchange?.(picked);
    }
  }
</script>

<div class="path">
  <input type="text" bind:value {placeholder} spellcheck="false" onchange={() => onchange?.(value ?? '')} />
  {#if clearable && value}
    <button type="button" class="btn ghost icon small" title="Clear" onclick={() => { value = ''; onchange?.(''); }}>
      <X size={14} />
    </button>
  {/if}
  <button type="button" class="btn small" onclick={browse}>
    <FolderOpen size={14} /> Browse
  </button>
</div>

<style>
  .path {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    min-width: 0;
  }
  input {
    flex: 1;
  }
</style>
