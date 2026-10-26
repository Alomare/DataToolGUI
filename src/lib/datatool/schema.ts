// What DataTool can do: modes, their flags and query syntax.
//
// Read from `util-tool-info` of the DataTool build in use, so a new release
// with new modes or flags shows up without an app update. Tool info has no
// flag defaults yet; those come from the `DataTool --help` tables.

import { MODE_EXTRAS, categoryFor } from './extras';

// ---------------------------------------------------------------------------
// util-tool-info JSON

export interface ToolInfoFlag {
  Name: string;
  HelpText: string | null;
  Required: boolean;
  TakesValue: boolean;
  ValueType: 'Invalid' | 'String' | 'Char' | 'Boolean' | 'Int' | 'Byte';
  IsPositional: boolean;
  Position: number;
  Choices: string[] | null;
}

export interface ToolInfoFlagGroup {
  Flags: ToolInfoFlag[];
  Name: string;
  Parent: string | null;
}

export interface ToolInfoQueryTag {
  Name: string;
  HumanName: string;
  DynamicChoicesKey: string;
  FixedValues: string[] | null;
}

export interface ToolInfoQueryType {
  Name: string;
  HumanName: string;
  DynamicChoicesKey: string;
  Tags: ToolInfoQueryTag[];
}

export interface ToolInfoTool {
  Name: string;
  Keyword: string;
  Description: string;
  SupportsJson: boolean;
  SupportsQuery: boolean;
  QueryInfo: { DynamicChoicesKey: string; Types: ToolInfoQueryType[] } | null;
}

export interface ToolInfo {
  Version: Record<string, string>;
  ToolFlags: ToolInfoFlagGroup;
  ToolGroups: Record<string, { Flags: ToolInfoFlagGroup; Tools: ToolInfoTool[] }>;
}

// ---------------------------------------------------------------------------
// The schema the UI works with

export type FlagType = 'boolean' | 'string' | 'int' | 'byte' | 'char';

export interface Flag {
  name: string;
  help: string;
  type: FlagType;
  /** Value DataTool uses when the flag isn't given. */
  default: string | boolean | null;
  choices: string[] | null;
  group: string;
}

export interface FlagGroup {
  id: string;
  title: string;
  description: string;
  flags: Flag[];
}

export interface QueryTag {
  name: string;
  label: string;
  values: string[];
  choicesKey: string;
}

export interface QueryType {
  name: string;
  label: string;
  choicesKey: string;
  tags: QueryTag[];
}

export interface QueryInfo {
  /** Dynamic-choices key for the first part of a query (hero, map, item...). */
  choicesKey: string;
  types: QueryType[];
  /** DataTool prints help and does nothing without a query. */
  required: boolean;
}

export type ModeKind = 'extract' | 'list' | 'other';

export interface Mode {
  keyword: string;
  label: string;
  description: string;
  help: string;
  category: string;
  /** ExtractFlags (needs an output folder), ListFlags (prints data), or another group. */
  flagGroup: string | null;
  kind: ModeKind;
  supportsJson: boolean;
  query: QueryInfo | null;
  /** Free-form extra positionals for modes that take something other than a query. */
  positionals: { label: string; placeholder: string; help: string; required: boolean } | null;
}

export interface Schema {
  /** DataTool version reported by the build, e.g. "2.25.0.0". */
  version: string | null;
  global: FlagGroup;
  groups: Record<string, FlagGroup>;
  modes: Mode[];
}

const GROUP_TITLES: Record<string, { title: string; description: string }> = {
  ToolFlags: { title: 'General', description: 'Apply to every mode.' },
  ExtractFlags: { title: 'Extraction', description: 'Apply to all extract-* and dump-* modes that save files.' },
  ListFlags: { title: 'Listing', description: 'Apply to list-* modes and dumps that print data.' },
};

function flagType(t: string | undefined): FlagType {
  switch ((t ?? '').toLowerCase()) {
    case 'boolean':
      return 'boolean';
    case 'int':
      return 'int';
    case 'byte':
      return 'byte';
    case 'char':
      return 'char';
    default:
      return 'string';
  }
}

function normalizeDefault(v: unknown, type: FlagType): string | boolean | null {
  if (v === null || v === undefined || v === '') return type === 'boolean' ? false : null;
  if (type === 'boolean') return v === true || String(v).toLowerCase() === 'true';
  return String(v);
}

/** Positionals that aren't really flags (directory, mode, out-path) and the help flag. */
const NOT_FLAGS = new Set(['directory', 'mode', 'out-path', 'h']);

function groupFrom(id: string, live: ToolInfoFlagGroup | null, defaults: Record<string, string>): FlagGroup {
  const meta = GROUP_TITLES[id] ?? { title: id.replace(/Flags$/, ''), description: '' };
  const flags: Flag[] = [];
  for (const lf of live?.Flags ?? []) {
    if (lf.IsPositional || NOT_FLAGS.has(lf.Name)) continue;
    const type = flagType(lf.ValueType);
    flags.push({
      name: lf.Name,
      help: lf.HelpText ?? '',
      type,
      default: normalizeDefault(defaults[lf.Name] ?? null, type),
      choices: lf.Choices ?? null,
      group: id,
    });
  }
  return { id, title: meta.title, description: meta.description, flags };
}

function queryFromLive(q: NonNullable<ToolInfoTool['QueryInfo']>): Omit<QueryInfo, 'required'> {
  return {
    choicesKey: q.DynamicChoicesKey ?? '',
    types: (q.Types ?? []).map((t) => ({
      name: t.Name,
      label: t.HumanName || t.Name,
      choicesKey: t.DynamicChoicesKey ?? '',
      tags: (t.Tags ?? []).map((g) => ({
        name: g.Name,
        label: g.HumanName || g.Name,
        values: g.FixedValues ?? [],
        choicesKey: g.DynamicChoicesKey ?? '',
      })),
    })),
  };
}

function kindOf(flagGroup: string | null): ModeKind {
  if (flagGroup === 'ExtractFlags') return 'extract';
  if (flagGroup === 'ListFlags') return 'list';
  return 'other';
}

/**
 * Parse defaults from `DataTool --help`: rows look like
 * `  --grayscale    | Convert single channel textures ... | True`.
 */
export function parseHelpDefaults(help: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of help.split(/\r?\n/)) {
    const cols = line.split('|').map((c) => c.trim());
    if (cols.length < 3 || !cols[0].startsWith('-')) continue;
    const name = cols[0].split(/\s+/)[0].replace(/^-+/, '');
    const def = cols[cols.length - 1];
    if (name && def) out[name] = def;
  }
  return out;
}

/** Parse "[Core] DataTool v2.25.0.0+1151+68397365" from DataTool's first log line. */
export function parseCoreVersion(text: string): string | null {
  return /DataTool v(\S+)/.exec(text)?.[1] ?? null;
}

export function buildSchema(live: ToolInfo | null, helpText = ''): Schema {
  const defaults = parseHelpDefaults(helpText);
  const groups: Record<string, FlagGroup> = {};
  for (const [id, g] of Object.entries(live?.ToolGroups ?? {})) groups[id] = groupFrom(id, g.Flags, defaults);
  const global = groupFrom('ToolFlags', live?.ToolFlags ?? null, defaults);

  const modes: Mode[] = [];
  for (const [flagGroup, g] of Object.entries(live?.ToolGroups ?? {})) {
    for (const tool of g.Tools) {
      const keyword = tool.Keyword;
      const extra = MODE_EXTRAS[keyword] ?? {};
      const query = tool.SupportsQuery && tool.QueryInfo ? { ...queryFromLive(tool.QueryInfo), required: extra.queryRequired ?? false } : null;
      modes.push({
        keyword,
        label: extra.label ?? (tool.Name || titleCase(keyword)),
        description: tool.Description ?? '',
        help: extra.help ?? '',
        category: extra.category ?? categoryFor(keyword),
        flagGroup,
        kind: kindOf(flagGroup),
        supportsJson: tool.SupportsJson,
        query,
        positionals: extra.positionals ?? null,
      });
    }
  }
  modes.sort((a, b) => a.label.localeCompare(b.label));

  return {
    version: live?.Version?.DataTool ?? null,
    global,
    groups,
    modes,
  };
}

function titleCase(keyword: string): string {
  const words = keyword.replace(/^(extract|list|dump|util|debug|te)-/, '').split('-');
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
