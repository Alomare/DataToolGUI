// DataTool's query syntax, as parsed by DataTool/IQueryParser.cs:
//
//   {target}|{type}=({tag}={value},{tag}={value}),{item},!{excluded item}|{type}=...
//
// - target: hero, NPC, map or item name in the game's text language, or "*"
// - type: e.g. skin, spray, emote ("*" = every type); no types = everything
// - tags (in parentheses) filter by rarity, event, league team; "!" negates
// - items: names; "*" or none = all; "!name" excludes
//
// Each query is one command-line argument; several can be given.

export interface QueryTagFilter {
  name: string;
  /** Values; a leading "!" excludes. */
  values: string[];
}

export interface QueryPart {
  type: string;
  items: string[];
  exclude: string[];
  tags: QueryTagFilter[];
}

export interface ParsedQuery {
  target: string;
  parts: QueryPart[];
}

export function emptyPart(type = '*'): QueryPart {
  return { type, items: [], exclude: [], tags: [] };
}

export function serializePart(p: QueryPart): string {
  const entries: string[] = [];
  const tagEntries = p.tags.flatMap((t) => t.values.filter(Boolean).map((v) => `${t.name}=${v}`));
  if (tagEntries.length) {
    tagEntries[0] = `(${tagEntries[0]}`;
    tagEntries[tagEntries.length - 1] = `${tagEntries[tagEntries.length - 1]})`;
    entries.push(...tagEntries);
  }
  entries.push(...p.items.filter(Boolean));
  entries.push(...p.exclude.filter(Boolean).map((x) => `!${x}`));
  return `${p.type || '*'}=${entries.length ? entries.join(',') : '*'}`;
}

export function serializeQuery(q: ParsedQuery): string {
  const target = q.target.trim() || '*';
  return [target, ...q.parts.map(serializePart)].join('|');
}

export function parseQuery(text: string): ParsedQuery {
  const [target, ...rest] = text.split('|');
  const parts: QueryPart[] = [];
  for (const seg of rest) {
    const eq = seg.indexOf('=');
    if (eq < 0) {
      parts.push(emptyPart(seg.trim() || '*'));
      continue;
    }
    const part = emptyPart(seg.slice(0, eq).trim() || '*');
    let insideTag = false;
    for (let item of seg.slice(eq + 1).split(',')) {
      let ending = false;
      if (item.startsWith('(')) {
        insideTag = true;
        item = item.slice(1);
      }
      if (item.endsWith(')') && insideTag) {
        ending = true;
        item = item.slice(0, -1);
      }
      if (insideTag) {
        const [name, ...v] = item.split('=');
        const value = v.join('=');
        if (name) {
          let tag = part.tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
          if (!tag) {
            tag = { name, values: [] };
            part.tags.push(tag);
          }
          if (value) tag.values.push(value);
        }
      } else if (item === '*' || item === '') {
        // glob: nothing to record
      } else if (item.startsWith('!')) {
        part.exclude.push(item.slice(1));
      } else {
        part.items.push(item);
      }
      if (ending) insideTag = false;
    }
    parts.push(part);
  }
  return { target: target.trim(), parts };
}

/**
 * Characters DataTool can't take inside a name: `,` and `|` split the query,
 * quotes make it refuse the whole command line, and leading `(`/`!` or a
 * trailing `)` change the meaning.
 */
export function nameProblem(name: string, asTarget = false): string | null {
  if (name.includes('"') || name.includes('”')) return 'contains a quote, which DataTool can\'t accept';
  if (name.includes('|')) return 'contains "|", which separates query parts';
  if (!asTarget && name.includes(',')) return 'contains ",", which separates names in a query';
  if (!asTarget && (name.startsWith('(') || name.endsWith(')'))) return 'starts or ends with a parenthesis, which marks tag filters';
  return null;
}

/** Problems with a full query string, for inline validation. */
export function queryProblems(text: string, typeNames: string[] = []): string[] {
  const problems: string[] = [];
  if (!text.trim()) return problems;
  if (/["”]/.test(text)) problems.push('Quotes aren\'t allowed: DataTool refuses commands that contain them.');
  const [target, ...rest] = text.split('|');
  if (!target.trim()) problems.push('Choose who or what this query is for (or * for everything).');
  const known = new Set(typeNames.map((t) => t.toLowerCase()));
  for (const seg of rest) {
    const eq = seg.indexOf('=');
    if (eq < 0) {
      problems.push(`"${seg}" needs a "=": write ${seg || 'type'}=* for everything of that type.`);
      continue;
    }
    const type = seg.slice(0, eq).toLowerCase();
    if (known.size && type !== '*' && !known.has(type)) problems.push(`Unknown type "${seg.slice(0, eq)}".`);
    const opens = (seg.match(/\(/g) ?? []).length;
    const closes = (seg.match(/\)/g) ?? []).length;
    if (opens !== closes) problems.push(`Unbalanced parentheses in "${seg}".`);
  }
  return problems;
}
