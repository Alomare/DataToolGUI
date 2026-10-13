<script lang="ts">
  // Visual editor for one query: target (hero, NPC...) plus types (skin,
  // spray...) with items, exclusions and tag filters. Always round-trips
  // through the query text, so the text stays the source of truth.
  import { Plus, Trash2 } from '@lucide/svelte';
  import ChipPicker from '$lib/components/ui/ChipPicker.svelte';
  import { childChoices, choicesFor, labelFor, type Choice, type DynamicChoices } from '$lib/datatool/choices';
  import { emptyPart, nameProblem, parseQuery, serializeQuery, type ParsedQuery } from '$lib/datatool/query';
  import type { QueryInfo, QueryType } from '$lib/datatool/schema';

  let {
    value = $bindable(''),
    query,
    data,
  }: {
    value?: string;
    query: QueryInfo;
    data: DynamicChoices | null;
  } = $props();

  let parsed = $derived(parseQuery(value));
  let targetOptions = $derived<Choice[]>([{ value: '*', label: 'Everything (*)' }, ...choicesFor(data, query.choicesKey)]);

  function update(fn: (q: ParsedQuery) => void) {
    const q = parseQuery(value);
    fn(q);
    value = serializeQuery(q);
  }

  function typeOf(name: string): QueryType | undefined {
    const n = name.toLowerCase();
    return query.types.find((t) => t.name.toLowerCase() === n);
  }

  /** Tags offered for a part: those of its type, or of the first type for "*". */
  function tagsOf(name: string) {
    return (typeOf(name) ?? query.types[0])?.tags ?? [];
  }

  function itemOptions(partType: string): Choice[] {
    const t = typeOf(partType);
    if (!t?.choicesKey) return [];
    return childChoices(data, query.choicesKey, parsed.target, t.choicesKey);
  }

  function tagOptions(values: string[], key: string): Choice[] {
    const fixed = values.map((v) => ({ value: v, label: v }));
    return key ? [...fixed, ...choicesFor(data, key)] : fixed;
  }

  const targetLabel = (v: string) => (v === '*' ? 'Everything' : labelFor(data, query.choicesKey, v));
  const itemProblem = (v: string) => nameProblem(v);
</script>

<div class="qb">
  <div class="target">
    <span class="lbl">From</span>
    <div class="grow">
      <ChipPicker
        values={parsed.target ? [parsed.target] : []}
        options={targetOptions}
        max={1}
        placeholder="Hero name, or * for all"
        labelFor={targetLabel}
        problem={(v) => nameProblem(v, true)}
        onchange={(v) => update((q) => (q.target = v[0] ?? ''))}
      />
    </div>
  </div>

  {#each parsed.parts as part, i (`${i}:${part.type}`)}
    {@const tags = tagsOf(part.type)}
    {@const opts = itemOptions(part.type)}
    <div class="part">
      <div class="part-head">
        <select
          value={typeOf(part.type)?.name ?? part.type}
          onchange={(e) =>
            update((q) => {
              q.parts[i] = { ...emptyPart((e.currentTarget as HTMLSelectElement).value), tags: q.parts[i].tags };
            })}
        >
          <option value="*">All types</option>
          {#each query.types as t (t.name)}
            <option value={t.name}>{t.label}</option>
          {/each}
          {#if part.type !== '*' && !typeOf(part.type)}<option value={part.type}>{part.type}</option>{/if}
        </select>
        <span class="tiny faint">
          {part.items.length ? '' : part.tags.some((t) => t.values.length) ? 'all matching the filters' : 'all'}
        </span>
        <span class="spacer"></span>
        <button class="btn ghost icon small" aria-label="Remove type" data-tip="Remove" onclick={() => update((q) => q.parts.splice(i, 1))}>
          <Trash2 size={14} />
        </button>
      </div>
      <div class="rows">
        <span class="lbl">Only</span>
        <ChipPicker
          values={part.items}
          options={opts}
          placeholder={opts.length ? `Pick ${typeOf(part.type)?.label.toLowerCase() ?? 'item'}s, or leave empty for all` : 'Names, or leave empty for all'}
          problem={itemProblem}
          onchange={(v) => update((q) => (q.parts[i].items = v))}
        />
        <span class="lbl">Except</span>
        <ChipPicker
          values={part.exclude}
          options={opts}
          variant="exclude"
          placeholder="Names to skip"
          problem={itemProblem}
          onchange={(v) => update((q) => (q.parts[i].exclude = v))}
        />
        {#each tags as tag (tag.name)}
          {@const current = part.tags.find((t) => t.name.toLowerCase() === tag.name.toLowerCase())}
          <span class="lbl">{tag.label}</span>
          <ChipPicker
            values={current?.values ?? []}
            options={tagOptions(tag.values, tag.choicesKey)}
            variant="tag"
            placeholder={`Any ${tag.label.toLowerCase()} (prefix ! to exclude)`}
            onchange={(v) =>
              update((q) => {
                const p = q.parts[i];
                const existing = p.tags.find((t) => t.name.toLowerCase() === tag.name.toLowerCase());
                if (existing) existing.values = v;
                else p.tags.push({ name: tag.name, values: v });
                p.tags = p.tags.filter((t) => t.values.length);
              })}
          />
        {/each}
      </div>
    </div>
  {/each}

  {#if query.types.length}
    <div class="row">
      <button class="btn small" onclick={() => update((q) => q.parts.push(emptyPart(query.types[0]?.name ?? '*')))}>
        <Plus size={14} /> Add a type
      </button>
      {#if !parsed.parts.length}
        <span class="tiny faint">No types: everything for {parsed.target === '*' || !parsed.target ? 'every hero' : targetLabel(parsed.target) ?? parsed.target}.</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .qb {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .target {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .lbl {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-3);
    min-width: 52px;
  }
  .part {
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    padding: 8px 10px 10px;
    margin-left: 62px;
  }
  .part-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }
  .part-head select {
    width: auto;
    min-width: 160px;
    font-weight: 600;
  }
  .rows {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 6px 10px;
  }
  .row {
    margin-left: 62px;
  }
</style>
