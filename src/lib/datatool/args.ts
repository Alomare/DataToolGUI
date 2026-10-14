// Turning a task (mode + query + options) into DataTool's command line.
//
// DataTool's parser (DataTool/Flag/FlagParser.cs):
// - positionals: <game folder> <mode> [output folder for extract modes] [queries...]
// - flags must be `--name=value`; `--name value` would make value a positional
// - booleans: `--name` means true, `--name=false` turns a default-on flag off
// - any `"` in an argument makes DataTool refuse the whole command

import { queryProblems } from './query';
import type { Flag, Mode, Schema } from './schema';

export type FlagValue = string | boolean;

export type ListOutput = 'view' | 'file' | 'text';

/** One configured run of a mode: what presets and history store. */
export interface TaskForm {
  mode: string;
  /** Output folder (extract modes). */
  output: string;
  /** Query arguments, one per positional. */
  queries: string[];
  /** Free-form positionals for modes that take paths or GUIDs. */
  positionals: string;
  /** Flags changed from their defaults (mode and general flags). */
  flags: Record<string, FlagValue>;
  /** List modes: show in the app, save JSON to a file, or plain text. */
  listOutput: ListOutput;
  listFile: string;
  simplify: boolean;
  /** Anything else, appended verbatim (split like a shell would). */
  extraArgs: string;
}

export function emptyTask(mode: string): TaskForm {
  return { mode, output: '', queries: [], positionals: '', flags: {}, listOutput: 'view', listFile: '', simplify: false, extraArgs: '' };
}

/** Split a string into arguments, honoring "double" and 'single' quotes. */
export function splitArgs(s: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: string | null = null;
  let has = false;
  for (const c of s) {
    if (quote) {
      if (c === quote) quote = null;
      else cur += c;
    } else if (c === '"' || c === "'") {
      quote = c;
      has = true;
    } else if (/\s/.test(c)) {
      if (has || cur) out.push(cur);
      cur = '';
      has = false;
    } else {
      cur += c;
    }
  }
  if (has || cur) out.push(cur);
  return out;
}

function sameAsDefault(flag: Flag, v: FlagValue): boolean {
  if (flag.type === 'boolean') return !!v === !!flag.default;
  return String(v ?? '') === String(flag.default ?? '');
}

/** Command-line form of one flag, or null when it's at its default. */
export function flagArg(flag: Flag, v: FlagValue | undefined): string | null {
  if (v === undefined || sameAsDefault(flag, v)) return null;
  if (flag.type === 'boolean') return v ? `--${flag.name}` : `--${flag.name}=false`;
  const s = String(v).trim();
  if (!s) return null;
  return `--${flag.name}=${s}`;
}

export const LIST_OUTPUT_FLAGS = new Set(['json', 'out', 'simplify']);

export interface BuildContext {
  schema: Schema;
  mode: Mode;
  task: TaskForm;
  /** Overwatch install folder. */
  game: string;
  /** General flags (language etc.) from the app's settings; the task's own flags win. */
  globalFlags: Record<string, FlagValue>;
  /** JSON file for list results shown in the app. */
  resultFile?: string;
}

export interface BuiltCommand {
  args: string[];
  errors: string[];
  warnings: string[];
}

function trimSlashes(p: string): string {
  // "C:\out\" is fine on its own, but a trailing backslash before a quote
  // confuses DataTool when the command is pasted into a terminal.
  return p.trim().replace(/(?<=[^:\\/])[\\/]+$/, '');
}

export function buildArgs(ctx: BuildContext): BuiltCommand {
  const { schema, mode, task } = ctx;
  const errors: string[] = [];
  const warnings: string[] = [];
  const game = trimSlashes(ctx.game);
  if (!game) errors.push('Choose your Overwatch folder first.');

  const args = [game || '<Overwatch folder>', mode.keyword];

  if (mode.kind === 'extract') {
    const out = trimSlashes(task.output);
    if (!out) errors.push('Choose an output folder.');
    args.push(out || '<output folder>');
  }

  if (mode.query) {
    const queries = task.queries.map((q) => q.trim()).filter(Boolean);
    if (mode.query.required && !queries.length) errors.push('Add at least one query (use * for everything).');
    const types = mode.query.types.map((t) => t.name);
    for (const q of queries) errors.push(...queryProblems(q, types));
    args.push(...queries);
  }
  if (mode.positionals) {
    const extra = splitArgs(task.positionals);
    if (mode.positionals.required && !extra.length) errors.push(`${mode.positionals.label} is required.`);
    args.push(...extra);
  }

  const group = mode.flagGroup ? schema.groups[mode.flagGroup] : undefined;
  const flags = [...schema.global.flags, ...(group?.flags ?? [])];
  for (const f of flags) {
    // Set by the output choice below.
    if (mode.kind === 'list' && LIST_OUTPUT_FLAGS.has(f.name)) continue;
    const v = f.name in task.flags ? task.flags[f.name] : ctx.globalFlags[f.name];
    const a = flagArg(f, v);
    if (a) args.push(a);
  }

  if (mode.kind === 'list') {
    if (task.listOutput === 'view' && mode.supportsJson) {
      if (ctx.resultFile) args.push('--json', `--out=${ctx.resultFile}`);
    } else if (task.listOutput === 'file' && mode.supportsJson) {
      const file = task.listFile.trim();
      if (!file) errors.push('Choose a file to save the JSON to.');
      args.push('--json', `--out=${file || '<file.json>'}`);
    } else if (task.simplify) {
      args.push('--simplify');
    }
  }

  args.push(...splitArgs(task.extraArgs));

  if (args.some((a) => /["”]/.test(a))) errors.push('Remove the quote characters: DataTool refuses any argument that contains them.');
  if (task.flags['args-save'] === true) warnings.push('"Save arguments" makes DataTool add these flags to every later run, including runs from this app.');

  return { args, errors, warnings };
}

/** Quote an argument for a Windows command prompt / PowerShell. */
export function quoteArg(a: string): string {
  if (a === '') return '""';
  // `*` and `?` too: pasted into bash (Git Bash, WSL) they would be globbed.
  return /[\s|&<>^()%!;,'`*?$]/.test(a) ? `"${a}"` : a;
}

export function formatCommand(exe: string, args: string[]): string {
  return [quoteArg(exe), ...args.map(quoteArg)].join(' ');
}
