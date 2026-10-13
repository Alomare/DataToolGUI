<script lang="ts">
  import '../app.css';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();

  // One tooltip for the whole app: any element with data-tip gets it. Fixed
  // positioning means it is never clipped by scrolling panels.
  let tip = $state<{ text: string; x: number; y: number; below: boolean } | null>(null);
  let current: Element | null = null;

  function show(target: Element) {
    const text = target.getAttribute('data-tip');
    if (!text) return;
    const r = target.getBoundingClientRect();
    const below = r.top < 90;
    tip = { text, x: Math.min(Math.max(r.left + r.width / 2, 180), window.innerWidth - 180), y: below ? r.bottom + 8 : r.top - 8, below };
  }

  function onover(e: MouseEvent) {
    const el = (e.target as Element | null)?.closest?.('[data-tip]') ?? null;
    if (el === current) return;
    current = el;
    if (el) show(el);
    else tip = null;
  }
</script>

<svelte:window onmouseover={onover} onscroll={() => (tip = null)} onmousedown={() => (tip = null)} />

{@render children()}

{#if tip}
  <div class="tooltip" style:left="{tip.x}px" style:top="{tip.y}px" style:transform={tip.below ? 'translate(-50%, 0)' : 'translate(-50%, -100%)'}>
    {tip.text}
  </div>
{/if}
