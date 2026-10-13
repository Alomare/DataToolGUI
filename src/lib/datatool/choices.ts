// Names the query builder offers, from `DataTool util-dynamic-choices`:
// heroes (with each hero's unlocks by type), NPCs, maps and league teams.

export interface DynamicChoice {
  QueryName: string;
  DisplayName: string;
  Children: DynamicChoices | null;
}

export interface DynamicChoices {
  Types: Record<string, { Choices: DynamicChoice[] }>;
}

export const HERO_KEY = 'datatool.ux.valid_hero_names';
export const NPC_KEY = 'datatool.ux.valid_npc_names';
export const MAP_KEY = 'datatool.ux.valid_map_names';

export interface Choice {
  /** What goes into the query. */
  value: string;
  /** What the user sees. */
  label: string;
  /** Extra text shown dimmed, e.g. the hero for an unlock. */
  hint?: string;
}

/**
 * The text to put in a query for a choice. Heroes/NPCs with a shared name are
 * shown as "Name (1AB)" and must be queried by their hex index; maps are
 * always queried by index because many variants share a name.
 */
export function queryValue(key: string, c: DynamicChoice): string {
  if (key === MAP_KEY) return c.QueryName;
  if (c.DisplayName.endsWith(` (${c.QueryName})`)) return c.QueryName;
  return c.DisplayName;
}

/** Top-level choices for a key (heroes, maps, ...), or unlocks of every hero for an unlock key. */
export function choicesFor(dc: DynamicChoices | null, key: string): Choice[] {
  if (!dc || !key) return [];
  const direct = dc.Types[key];
  if (direct) {
    return dedupe(direct.Choices.map((c) => ({ value: queryValue(key, c), label: c.DisplayName })));
  }
  // Unlock keys (valid_spray_names...) live under each hero.
  const out: Choice[] = [];
  for (const owner of [HERO_KEY, NPC_KEY]) {
    for (const hero of dc.Types[owner]?.Choices ?? []) {
      for (const c of hero.Children?.Types[key]?.Choices ?? []) {
        out.push({ value: c.QueryName, label: c.DisplayName, hint: hero.DisplayName });
      }
    }
  }
  return dedupe(out);
}

/** Unlocks of one type for a target (hero name/index, or "*" for all heroes). */
export function childChoices(dc: DynamicChoices | null, rootKey: string, target: string, typeKey: string): Choice[] {
  if (!dc || !typeKey) return [];
  const roots = dc.Types[rootKey]?.Choices ?? [];
  const t = target.trim().toLowerCase();
  const owners = !t || t === '*' ? roots : roots.filter((r) => queryValue(rootKey, r).toLowerCase() === t || r.DisplayName.toLowerCase() === t);
  const out: Choice[] = [];
  for (const owner of owners) {
    for (const c of owner.Children?.Types[typeKey]?.Choices ?? []) {
      out.push({ value: c.QueryName, label: c.DisplayName, hint: owners.length > 1 ? owner.DisplayName : undefined });
    }
  }
  return dedupe(out);
}

/** Label for a query value (e.g. map index "5B" -> "Temple of Anubis"). */
export function labelFor(dc: DynamicChoices | null, key: string, value: string): string | null {
  const c = dc?.Types[key]?.Choices.find((x) => queryValue(key, x).toLowerCase() === value.toLowerCase());
  return c?.DisplayName ?? null;
}

function dedupe(list: Choice[]): Choice[] {
  const seen = new Map<string, Choice>();
  for (const c of list) {
    const k = c.value.toLowerCase();
    const prev = seen.get(k);
    if (!prev) seen.set(k, { ...c });
    else if (c.hint && prev.hint && !prev.hint.split(', ').includes(c.hint)) {
      // Same item for several heroes: show a short owner list.
      const owners = prev.hint.split(', ');
      prev.hint = owners.length >= 3 ? (owners.length === 3 ? `${prev.hint}…` : prev.hint) : `${prev.hint}, ${c.hint}`;
    }
  }
  return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
}
