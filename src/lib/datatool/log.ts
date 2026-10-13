// Making sense of DataTool's log: line severity, progress phases, and
// known problems with a fix the app can suggest.

export type LineKind = 'error' | 'warn' | 'success' | 'meta' | 'step' | 'detail' | 'plain';

export function classifyLine(line: string): LineKind {
  const t = line.trimStart();
  if (/^at\s+\S+.*\(|^at\s+[\w.<>`]+\(/.test(t) || /^---\s*End of/.test(t)) return 'error';
  const cat = /^\[([^\]]+)\]/.exec(t)?.[1] ?? '';
  if (cat === 'GUIDNames' || cat === 'SpellCheck' || /^\[Query\] (In 2026|On the Chinese|In Chinese|Your game language)/.test(t)) return 'warn';
  if (/Execution finished/.test(t)) return 'success';
  if (/Found nothing matching|Error|Exception|error!|failed|is required|is invalid for flag|cannot interpret|does not support|not a valid/i.test(t)) return 'error';
  if (/\bwarn|not installed|not supported|proceed with caution|deprecated|USE extract-/i.test(t)) return 'warn';
  if (cat) return 'meta';
  if (line.startsWith('\t') || line.startsWith('  ')) return 'detail';
  return 'step';
}

export type Phase = 'starting' | 'loading' | 'working' | 'finished';

export const PHASE_LABEL: Record<Phase, string> = {
  starting: 'Starting',
  loading: 'Loading game files',
  working: 'Working',
  finished: 'Finished',
};

/** Phase after seeing `line`, given the current one. */
export function nextPhase(phase: Phase, line: string): Phase {
  if (/\[Core\] Execution finished/.test(line)) return 'finished';
  if (/\[Core\] Tooling/.test(line)) return 'working';
  if (phase === 'starting' && /^\[(CASC|Manifest)\]/.test(line)) return 'loading';
  return phase;
}

/** "prometheus-2_25_0_0-154088" -> "2.25.0.0.154088" */
export function parseGameBuild(line: string): string | null {
  const m = /\[CASC\] Overwatch build (\S+)/.exec(line);
  if (!m) return null;
  const v = /(\d+(?:_\d+)+)-(\d+)/.exec(m[1]);
  return v ? `${v[1].replace(/_/g, '.')}.${v[2]}` : m[1];
}

export interface Diagnosis {
  kind: 'update' | 'close-game' | 'repair' | 'query' | 'usage' | 'language' | 'crash';
  title: string;
  detail?: string;
  suggestions?: { query: string; suggestion: string }[];
}

/** Known problems in a finished job's log, most important first. */
export function diagnose(lines: string[]): Diagnosis[] {
  const out: Diagnosis[] = [];
  const text = lines.join('\n');
  if (/does not support this version of Overwatch|UnsupportedBuildVersion/i.test(text)) {
    out.push({
      kind: 'update',
      title: 'This DataTool build doesn\'t support your game version',
      detail: 'Every Overwatch patch needs a new DataTool release. Check for a DataTool update; new releases can take a few days after a patch.',
    });
  }
  if (/Is Overwatch is running|Close Overwatch and Battle\.net/i.test(text)) {
    out.push({ kind: 'close-game', title: 'The game files are in use', detail: 'Close Overwatch and Battle.net (or Steam\'s download of the game), then try again.' });
  }
  if (/Error initializing CASC/i.test(text)) {
    out.push({
      kind: 'repair',
      title: 'DataTool couldn\'t read the game files',
      detail: 'Scan and repair the game in Battle.net or verify it in Steam, launch it once, and try again. Also check that the Overwatch folder is right.',
    });
  }
  const suggestions: { query: string; suggestion: string }[] = [];
  const missing: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /Found nothing matching your query of "(.+)"/.exec(lines[i]);
    if (!m) continue;
    missing.push(m[1]);
    const s = /Did you mean: "(.+)"/.exec(lines[i + 1] ?? '');
    if (s) suggestions.push({ query: m[1], suggestion: s[1] });
  }
  if (missing.length) {
    out.push({
      kind: 'query',
      title: `Nothing matched ${missing.length === 1 ? `"${missing[0]}"` : `${missing.length} parts of your query`}`,
      detail: 'Names must be written exactly as in-game, in the text language DataTool loads.',
      suggestions,
    });
  }
  for (const re of [/Positional "(.+)" is required/, /Value (.+) is invalid for flag (.+?), valid values are (.+)/, /The tool cannot interpret your command/, /Unknown (type|tag): (.+)/]) {
    const m = lines.find((l) => re.test(l));
    if (m) out.push({ kind: 'usage', title: 'DataTool didn\'t understand the command', detail: m.replace(/^\[\w+\]\s*/, '') });
  }
  const lang = lines.find((l) => /language .* is not installed/i.test(l));
  if (lang) out.push({ kind: 'language', title: 'Language not installed in the game', detail: lang.replace(/^\[\w+\]\s*/, '') });
  return out;
}

/** The exception message DataTool printed before a crash, if any. */
export function crashMessage(lines: string[]): string | null {
  const at = lines.findIndex((l) => /^\s+at\s/.test(l));
  if (at <= 0) return null;
  return lines[at - 1].trim();
}
