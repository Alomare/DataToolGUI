// What DataTool can do: modes, their flags and query syntax.
//
// Built from three sources, in order of trust:
// 1. `util-tool-info` from the DataTool build in use (always current, but
//    leaves out debug modes, hidden flags, aliases and defaults),
// 2. defaults scraped from `DataTool --help` of that build,
// 3. catalog.json, generated from the OWLib source (scripts/gen-catalog.mjs).
// So a new DataTool release with new modes or flags shows up without an app
// update; the catalog only adds detail.

import bundled from './catalog.json';
import { MODE_EXTRAS, QUERY_OVERRIDES, categoryFor } from './extras';

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
// Bundled catalog

interface CatalogFlag {
  name: string;
  field: string;
  aliases: string[];
  help: string;
  default: string | boolean | number | null;
  needsValue: boolean;
  type: string;
  choices: string[] | null;
  hidden: boolean;
  required: boolean;
  positional: number;
}

interface CatalogTool {
  keyword: string;
  aliases: string[];
  name: string;
  description: string;
  flags: string | null;
  sensitive: boolean;
  noArchive: boolean;
  queryParser: boolean;
}

interface Catalog {
  generatedFrom: { repo: string; commit: string | null; version: string | null };
  flagGroups: Record<string, { name: string; parent: string; title: string | null; description: string | null; flags: CatalogFlag[] }>;
  tools: CatalogTool[];
}

export const catalog = bundled as unknown as Catalog;

// ---------------------------------------------------------------------------
// The merged schema the UI works with

export type FlagType = 'boolean' | 'string' | 'int' | 'byte' | 'char';

export interface Flag {
  name: string;
  aliases: string[];
  help: string;
  type: FlagType;
  /** Value DataTool uses when the flag isn't given. */
  default: string | boolean | null;
  choices: string[] | null;
  /** Not shown in DataTool's own help: debug/expert options. */
  hidden: boolean;
  /** Reported by the DataTool build in use (false = known from the catalog only). */
  live: boolean;
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
  aliases: string[];
  label: string;
  description: string;
  help: string;
  category: string;
  /** ExtractFlags (needs an output folder), ListFlags (prints data), or another group. */
  flagGroup: string | null;
  kind: ModeKind;
  /** Hidden from DataTool's own help (debug and internal modes). */
  sensitive: boolean;
  /** Runs without reading the game files. */
  noArchive: boolean;
  supportsJson: boolean;
  query: QueryInfo | null;
  /** Free-form extra positionals for modes that take something other than a query. */
  positionals: { label: string; placeholder: string; help: string; required: boolean } | null;
  /** In the DataTool build in use (false = from the catalog; may not exist in this build). */
  live: boolean;
}

export interface Schema {
  /** DataTool version reported by the build, e.g. "2.25.0.0". */
  version: string | null;
  global: FlagGroup;
  groups: Record<string, FlagGroup>;
  modes: Mode[];
  /** Whether the live tool info was available. */
  fromLive: boolean;
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

function mergeGroup(id: string, live: ToolInfoFlagGroup | null, defaults: Record<string, string>): FlagGroup {
  const cat = catalog.flagGroups[id];
  const meta = GROUP_TITLES[id] ?? { title: cat?.title ?? id.replace(/Flags$/, ''), description: cat?.description ?? '' };
  const flags: Flag[] = [];
  const seen = new Set<string>();

  for (const lf of live?.Flags ?? []) {
    if (lf.IsPositional || NOT_FLAGS.has(lf.Name)) continue;
    const cf = cat?.flags.find((f) => f.name === lf.Name);
    const type = flagType(lf.ValueType);
    const scraped = defaults[lf.Name];
    flags.push({
      name: lf.Name,
      aliases: cf?.aliases ?? [],
      help: lf.HelpText ?? cf?.help ?? '',
      type,
      default: normalizeDefault(scraped ?? cf?.default ?? null, type),
      choices: lf.Choices ?? cf?.choices ?? null,
      hidden: false,
      live: true,
      group: id,
    });
    seen.add(lf.Name);
  }
  for (const cf of cat?.flags ?? []) {
    if (seen.has(cf.name) || cf.positional >= 0 || NOT_FLAGS.has(cf.name)) continue;
    const type = flagType(cf.type);
    flags.push({
      name: cf.name,
      aliases: cf.aliases,
      help: cf.help,
      type,
      default: normalizeDefault(defaults[cf.name] ?? cf.default, type),
      choices: cf.choices,
      // Without live info we can't tell a newly hidden flag apart, so trust the catalog.
      hidden: live ? true : cf.hidden,
      live: false,
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
  const groupIds = new Set<string>(['ExtractFlags', 'ListFlags', ...Object.keys(live?.ToolGroups ?? {})]);
  const groups: Record<string, FlagGroup> = {};
  for (const id of groupIds) groups[id] = mergeGroup(id, live?.ToolGroups[id]?.Flags ?? null, defaults);
  const global = mergeGroup('ToolFlags', live?.ToolFlags ?? null, defaults);

  const modes: Mode[] = [];
  const liveTools = new Map<string, { tool: ToolInfoTool; group: string }>();
  for (const [group, g] of Object.entries(live?.ToolGroups ?? {})) {
    for (const tool of g.Tools) liveTools.set(tool.Keyword, { tool, group });
  }

  const keywords = new Set<string>([...liveTools.keys(), ...catalog.tools.map((t) => t.keyword)]);
  for (const keyword of keywords) {
    const lt = liveTools.get(keyword);
    const ct = catalog.tools.find((t) => t.keyword === keyword);
    // A mode the catalog knows as public but the live build doesn't list was
    // removed (or renamed) in this DataTool build: skip it.
    if (live && !lt && ct && !ct.sensitive) continue;
    const extra = MODE_EXTRAS[keyword] ?? {};
    const flagGroup = lt?.group ?? ct?.flags ?? null;

    let query: QueryInfo | null = null;
    const override = QUERY_OVERRIDES[keyword];
    if (lt?.tool.SupportsQuery && lt.tool.QueryInfo) {
      query = { ...queryFromLive(lt.tool.QueryInfo), required: extra.queryRequired ?? false };
    } else if (override) {
      query = { ...override, required: extra.queryRequired ?? false };
    } else if (!lt && ct?.queryParser) {
      query = { choicesKey: '', types: [], required: extra.queryRequired ?? false };
    }

    const name = lt?.tool.Name || ct?.name || '';
    const description = lt?.tool.Description || ct?.description || '';
    modes.push({
      keyword,
      aliases: ct?.aliases ?? [],
      label: extra.label ?? (name || titleCase(keyword)),
      description,
      help: extra.help ?? '',
      category: extra.category ?? categoryFor(keyword, !!ct?.sensitive && !lt),
      flagGroup,
      kind: kindOf(flagGroup),
      sensitive: !lt && !!ct?.sensitive,
      noArchive: ct?.noArchive ?? false,
      supportsJson: lt?.tool.SupportsJson ?? (flagGroup === 'ListFlags'),
      query,
      positionals: extra.positionals ?? null,
      live: !!lt,
    });
  }
  modes.sort((a, b) => a.label.localeCompare(b.label));

  return {
    version: live?.Version?.DataTool ?? null,
    global,
    groups,
    modes,
    fromLive: !!live,
  };
}

function titleCase(keyword: string): string {
  const words = keyword.replace(/^(extract|list|dump|util|debug|te)-/, '').split('-');
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
