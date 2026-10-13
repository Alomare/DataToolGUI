<script lang="ts">
  // Pick values from a searchable list (or type your own); each value is a chip.
  import { X } from '@lucide/svelte';
  import type { Choice } from '$lib/datatool/choices';

  let {
    values = $bindable([]),
    options = [],
    placeholder = 'Type to search…',
    max = Infinity,
    variant = '',
    allowFree = true,
    labelFor,
    problem,
    onchange,
  }: {
    values?: string[];
    options?: Choice[];
    placeholder?: string;
    max?: number;
    variant?: '' | 'exclude' | 'tag';
    allowFree?: boolean;
    labelFor?: (v: string) => string | null;
    problem?: (v: string) => string | null;
    onchange?: (v: string[]) => void;
  } = $props();

  const LIMIT = 120;
  let text = $state('');
  let open = $state(false);
  let active = $state(0);
  let input = $state<HTMLInputElement>();
  let root = $state<HTMLDivElement>();

  let filtered = $derived.by(() => {
    const q = text.trim().toLowerCase();
    const taken = new Set(values.map((v) => v.toLowerCase()));
    const list = options.filter((o) => !taken.has(o.value.toLowerCase()));
    if (!q) return list;
    const starts: Choice[] = [];
    const contains: Choice[] = [];
    for (const o of list) {
      const l = o.label.toLowerCase();
      if (l.startsWith(q) || o.value.toLowerCase() === q) starts.push(o);
      else if (l.includes(q) || o.value.toLowerCase().includes(q) || o.hint?.toLowerCase().includes(q)) contains.push(o);
    }
    return [...starts, ...contains];
  });
  let shown = $derived(filtered.slice(0, LIMIT));
  let full = $derived(values.length >= max);

  function emit(next: string[]) {
    values = next;
    onchange?.(next);
  }

  function add(v: string) {
    const value = v.trim();
    if (!value || full) return;
    if (values.some((x) => x.toLowerCase() === value.toLowerCase())) return;
    emit([...values, value]);
    text = '';
    active = 0;
    if (values.length >= max) open = false;
  }

  function remove(i: number) {
    emit(values.filter((_, j) => j !== i));
    input?.focus();
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      open = true;
      active = Math.min(active + 1, shown.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      active = Math.max(active - 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && shown[active]) add(shown[active].value);
      else if (allowFree && text.trim()) add(text);
    } else if (e.key === 'Escape') {
      open = false;
    } else if (e.key === 'Backspace' && !text && values.length) {
      remove(values.length - 1);
    } else if (e.key === 'Tab' && allowFree && text.trim()) {
      add(text);
    }
  }

  function onfocusout(e: FocusEvent) {
    if (!root?.contains(e.relatedTarget as Node | null)) {
      open = false;
      if (allowFree && text.trim()) add(text);
    }
  }
</script>

<div class="picker" class:open bind:this={root} {onfocusout}>
  <div class="box" role="presentation" onclick={() => input?.focus()}>
    {#each values as v, i (v)}
      {@const label = labelFor?.(v)}
      {@const bad = problem?.(v)}
      <span class="chip {variant}" class:bad data-tip={bad ? `"${v}" ${bad}` : label && label !== v ? `Query value: ${v}` : null}>
        <span>{variant === 'exclude' ? 'not ' : ''}{label ?? v}</span>
        <button type="button" aria-label="Remove {label ?? v}" onclick={(e) => { e.stopPropagation(); remove(i); }}><X size={12} /></button>
      </span>
    {/each}
    {#if !full}
      <input
        bind:this={input}
        bind:value={text}
        placeholder={values.length ? '' : placeholder}
        spellcheck="false"
        onfocus={() => (open = true)}
        oninput={() => {
          open = true;
          active = 0;
        }}
        {onkeydown}
      />
    {/if}
  </div>
  {#if open && !full && (shown.length || (allowFree && text.trim()))}
    <div class="menu card" role="listbox">
      {#if allowFree && text.trim() && !shown.some((o) => o.value.toLowerCase() === text.trim().toLowerCase())}
        <button type="button" class="opt free" tabindex="-1" onmousedown={(e) => e.preventDefault()} onclick={() => add(text)}>
          Use “{text.trim()}”
        </button>
      {/if}
      {#each shown as o, i (o.value)}
        {@const bad = problem?.(o.value)}
        <button
          type="button"
          class="opt"
          class:active={i === active}
          class:bad
          role="option"
          aria-selected={i === active}
          tabindex="-1"
          data-tip={bad ? `DataTool can't match this name: it ${bad}` : null}
          onmousedown={(e) => e.preventDefault()}
          onmouseenter={() => (active = i)}
          onclick={() => add(o.value)}
        >
          <span class="ellipsis">{o.label}</span>
          {#if o.hint}<span class="hint ellipsis">{o.hint}</span>{/if}
        </button>
      {/each}
      {#if filtered.length > LIMIT}
        <div class="more tiny faint">{(filtered.length - LIMIT).toLocaleString()} more — keep typing to narrow down</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .picker {
    position: relative;
    width: 100%;
    min-width: 0;
  }
  .box {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    min-height: 32px;
    padding: 3px 4px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--surface);
    cursor: text;
  }
  .picker.open .box {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  input {
    flex: 1;
    min-width: 120px;
    height: 24px;
    border: 0 !important;
    box-shadow: none !important;
    padding: 0 4px;
    background: transparent;
  }
  .chip.bad {
    border-color: var(--danger);
  }
  .menu {
    position: absolute;
    z-index: 50;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    max-height: 300px;
    overflow: auto;
    padding: 4px;
    box-shadow: var(--shadow-lg);
  }
  .opt {
    display: flex;
    align-items: baseline;
    gap: 10px;
    width: 100%;
    padding: 6px 8px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    text-align: left;
    font-size: 13px;
  }
  .opt.active {
    background: var(--accent-soft);
  }
  .opt.free {
    color: var(--accent);
    font-weight: 600;
  }
  .opt.bad {
    color: var(--danger);
  }
  .hint {
    margin-left: auto;
    flex-shrink: 1;
    font-size: 11.5px;
    color: var(--text-3);
    max-width: 50%;
  }
  .more {
    padding: 6px 8px;
  }
</style>
