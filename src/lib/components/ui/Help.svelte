<script lang="ts">
  import { CircleHelp } from '@lucide/svelte';

  let { text }: { text: string } = $props();
</script>

<span class="help" data-tip={text} tabindex="-1" aria-label={text}>
  <CircleHelp size={14} />
</span>

<style>
  .help {
    display: inline-flex;
    color: var(--text-3);
    cursor: help;
    vertical-align: middle;
  }
  .help:hover {
    color: var(--accent);
  }
</style>
