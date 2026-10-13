// Turning DataTool's list JSON into a table when it has a tabular shape:
// an object of records ({"000000000002.075": {...}, ...}) or an array of them.

export interface Table {
  /** Column for the object key (GUIDs etc.), when the data is keyed. */
  keyColumn: string | null;
  columns: string[];
  rows: { key: string; record: Record<string, unknown> }[];
}

const MAX_COLUMNS = 14;

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Records nested one level down, e.g. {"Heroes": {...records}}. */
function unwrap(data: unknown): unknown {
  if (isRecord(data)) {
    const vals = Object.values(data);
    if (vals.length === 1 && (Array.isArray(vals[0]) || isRecord(vals[0]))) return vals[0];
  }
  return data;
}

export function toTable(data: unknown): Table | null {
  const d = unwrap(data);
  let rows: Table['rows'];
  let keyColumn: string | null = null;
  if (Array.isArray(d)) {
    if (!d.length || !d.every(isRecord)) return null;
    rows = d.map((r, i) => ({ key: String(i), record: r as Record<string, unknown> }));
  } else if (isRecord(d)) {
    const entries = Object.entries(d);
    if (!entries.length || !entries.every(([, v]) => isRecord(v))) return null;
    rows = entries.map(([k, v]) => ({ key: k, record: v as Record<string, unknown> }));
    keyColumn = 'Key';
  } else {
    return null;
  }

  // Columns: keys of the first rows, scalar-valued ones first.
  const score = new Map<string, number>();
  for (const { record } of rows.slice(0, 300)) {
    for (const [k, v] of Object.entries(record)) {
      const scalar = v === null || typeof v !== 'object';
      score.set(k, (score.get(k) ?? 0) + (scalar ? 2 : 1));
    }
  }
  const columns = [...score.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  // Name-like columns lead.
  const lead = ['Name', 'name', 'DisplayName', 'Title', 'Type', 'Class', 'Rarity'];
  columns.sort((a, b) => {
    const ia = lead.indexOf(a);
    const ib = lead.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  // Keep the GUID key column only when it isn't repeated inside each record.
  if (keyColumn && rows.every((r) => Object.values(r.record).includes(r.key))) keyColumn = null;
  return { keyColumn, columns: columns.slice(0, MAX_COLUMNS), rows };
}

export function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.every((x) => x === null || typeof x !== 'object') ? v.join(', ') : `[${v.length}]`;
  if (typeof v === 'object') return `{${Object.keys(v as object).length}}`;
  return String(v);
}

/** All text in a value, for search. */
export function searchText(v: unknown, depth = 0): string {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'object') return String(v);
  if (depth > 3) return '';
  return Object.values(v as object)
    .map((x) => searchText(x, depth + 1))
    .join(' ');
}
