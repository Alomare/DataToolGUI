import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildArgs, emptyTask, flagArg, formatCommand, splitArgs } from './args';
import { childChoices, choicesFor, HERO_KEY, labelFor, MAP_KEY, type DynamicChoices } from './choices';
import { classifyLine, diagnose, nextPhase, parseGameBuild } from './log';
import { nameProblem, parseQuery, queryProblems, serializeQuery } from './query';
import { buildSchema, parseCoreVersion, parseHelpDefaults, type ToolInfo } from './schema';

const fixtures = join(__dirname, 'fixtures');
const toolInfo = JSON.parse(readFileSync(join(fixtures, 'toolinfo.json'), 'utf8').replace(/^\uFEFF/, '')) as ToolInfo;
const help = readFileSync(join(fixtures, 'help.txt'), 'utf8');
const choices = JSON.parse(readFileSync(join(fixtures, 'choices.json'), 'utf8')) as DynamicChoices;

describe('schema', () => {
  const schema = buildSchema(toolInfo, help);
  const mode = (k: string) => schema.modes.find((m) => m.keyword === k)!;

  it('reads modes from tool info and adds debug modes from the catalog', () => {
    expect(schema.version).toBe('2.25.0.0');
    expect(mode('extract-unlocks').live).toBe(true);
    expect(mode('extract-unlocks').kind).toBe('extract');
    expect(mode('list-heroes').kind).toBe('list');
    expect(mode('extract-anything').sensitive).toBe(true);
    expect(mode('extract-anything').live).toBe(false);
    expect(mode('extract-anything').query?.required).toBe(true);
  });

  it('keeps query types and tags', () => {
    const q = mode('extract-unlocks').query!;
    expect(q.choicesKey).toBe(HERO_KEY);
    expect(q.required).toBe(true);
    const skin = q.types.find((t) => t.name === 'skin')!;
    expect(skin.tags.map((t) => t.name)).toEqual(['rarity', 'event', 'leagueTeam']);
    expect(skin.tags[0].values).toContain('legendary');
    expect(mode('extract-sprays').query?.required).toBe(false);
  });

  it('merges defaults, help-scraped defaults and hidden flags', () => {
    const ex = schema.groups.ExtractFlags.flags;
    const f = (n: string) => ex.find((x) => x.name === n)!;
    expect(f('grayscale').default).toBe(true);
    expect(f('convert-textures-type').default).toBe('png');
    expect(f('convert-textures-type').choices).toEqual(['dds', 'tif', 'png']);
    expect(f('voice-group-by-hero').hidden).toBe(true);
    expect(f('voice-group-by-hero').default).toBe(true);
    expect(f('all-lods').aliases).toEqual(['lods']);
    expect(ex.some((x) => x.name === 'out-path')).toBe(false);
    const online = schema.global.flags.find((x) => x.name === 'online')!;
    expect(online.default).toBe(true);
    expect(schema.global.flags.some((x) => x.name === 'h')).toBe(false);
  });

  it('works from the catalog alone', () => {
    const offline = buildSchema(null);
    expect(offline.fromLive).toBe(false);
    expect(offline.modes.find((m) => m.keyword === 'extract-maps')?.query).not.toBeNull();
    expect(offline.groups.ExtractFlags.flags.find((f) => f.name === 'raw')?.hidden).toBe(false);
  });

  it('parses help defaults and the version line', () => {
    const d = parseHelpDefaults(help);
    expect(d['grayscale']).toBe('True');
    expect(d['convert-textures-type']).toBe('png');
    expect(parseCoreVersion('[Core] DataTool v2.25.0.0+1151+68397365')).toBe('2.25.0.0+1151+68397365');
  });
});

describe('query', () => {
  it('round-trips the documented examples', () => {
    for (const q of ['Tracer|skin=Overwatch Classic', '*|skin=*', 'Reaper|spray=*', 'Lúcio|skin=(rarity=legendary),!Default', 'Mercy|skin=(rarity=legendary,event=halloween)|emote=*', 'Dorado']) {
      expect(serializeQuery(parseQuery(q))).toBe(q);
    }
  });

  it('parses tags, items and exclusions', () => {
    const q = parseQuery('Mercy|skin=(rarity=legendary,rarity=!epic),Witch,!Default');
    expect(q.target).toBe('Mercy');
    expect(q.parts[0]).toEqual({ type: 'skin', items: ['Witch'], exclude: ['Default'], tags: [{ name: 'rarity', values: ['legendary', '!epic'] }] });
  });

  it('flags names DataTool cannot match', () => {
    expect(nameProblem('Venomous" by Leon')).toMatch(/quote/);
    expect(nameProblem('A, B')).toMatch(/,/);
    expect(nameProblem('Fine Name')).toBeNull();
    expect(queryProblems('Tracer|skin', ['skin'])[0]).toMatch(/needs a "="/);
    expect(queryProblems('Tracer|skn=x', ['skin'])[0]).toMatch(/Unknown type/);
    expect(queryProblems('Tracer|skin=(rarity=epic', ['skin'])[0]).toMatch(/parentheses/);
  });
});

describe('args', () => {
  const schema = buildSchema(toolInfo, help);
  const mode = (k: string) => schema.modes.find((m) => m.keyword === k)!;

  it('builds an extract command with only changed flags', () => {
    const task = { ...emptyTask('extract-unlocks'), output: 'C:\\Out\\', queries: ['Tracer|skin=Overwatch Classic', ''] };
    task.flags = { 'convert-textures-type': 'tif', grayscale: false, 'all-lods': true, raw: false };
    const r = buildArgs({ schema, mode: mode('extract-unlocks'), task, game: 'C:\\Games\\Overwatch', globalFlags: { language: 'enUS' } });
    expect(r.errors).toEqual([]);
    expect(r.args).toEqual([
      'C:\\Games\\Overwatch',
      'extract-unlocks',
      'C:\\Out',
      'Tracer|skin=Overwatch Classic',
      '--language=enUS',
      '--convert-textures-type=tif',
      '--grayscale=false',
      '--all-lods',
    ]);
  });

  it('lets a task override general flags', () => {
    const task = { ...emptyTask('list-heroes'), flags: { language: 'frFR' } };
    const r = buildArgs({ schema, mode: mode('list-heroes'), task, game: 'D:\\OW', globalFlags: { language: 'enUS' }, resultFile: 'C:\\r.json' });
    expect(r.args).toEqual(['D:\\OW', 'list-heroes', '--language=frFR', '--json', '--out=C:\\r.json']);
  });

  it('reports missing pieces and quotes', () => {
    const r = buildArgs({ schema, mode: mode('extract-maps'), task: { ...emptyTask('extract-maps'), queries: ['Kings "Row'] }, game: '', globalFlags: {} });
    expect(r.errors.join(' ')).toMatch(/Overwatch folder/);
    expect(r.errors.join(' ')).toMatch(/output folder/);
    expect(r.errors.join(' ')).toMatch(/quote/);
    const r2 = buildArgs({ schema, mode: mode('extract-maps'), task: { ...emptyTask('extract-maps'), output: 'C:\\o' }, game: 'C:\\g', globalFlags: {} });
    expect(r2.errors.join(' ')).toMatch(/query/);
  });

  it('list output choices', () => {
    const base = { schema, mode: mode('list-maps'), game: 'C:\\g', globalFlags: {} };
    expect(buildArgs({ ...base, task: { ...emptyTask('list-maps'), listOutput: 'file', listFile: 'C:\\maps.json' } }).args.slice(2)).toEqual(['--json', '--out=C:\\maps.json']);
    expect(buildArgs({ ...base, task: { ...emptyTask('list-maps'), listOutput: 'text', simplify: true } }).args.slice(2)).toEqual(['--simplify']);
    const real = { ...base, mode: mode('list-subtitles-real') };
    expect(buildArgs({ ...real, task: emptyTask('list-subtitles-real'), resultFile: 'C:\\x.json' }).args.slice(2)).toEqual([]);
  });

  it('formats flags and command lines', () => {
    const grayscale = buildSchema(toolInfo, help).groups.ExtractFlags.flags.find((f) => f.name === 'grayscale')!;
    expect(flagArg(grayscale, true)).toBeNull();
    expect(flagArg(grayscale, false)).toBe('--grayscale=false');
    expect(splitArgs('--a "b c" \'d\' e')).toEqual(['--a', 'b c', 'd', 'e']);
    expect(formatCommand('C:\\DT\\DataTool.exe', ['C:\\Program Files\\OW', 'extract-unlocks', 'Tracer|skin=*'])).toBe(
      'C:\\DT\\DataTool.exe "C:\\Program Files\\OW" extract-unlocks "Tracer|skin=*"',
    );
  });
});

describe('choices', () => {
  it('lists heroes, maps by index and unlocks per hero', () => {
    const heroes = choicesFor(choices, HERO_KEY);
    expect(heroes.map((h) => h.value)).toContain('Tracer');
    const maps = choicesFor(choices, MAP_KEY);
    expect(maps[0].value).toMatch(/^[0-9A-F]+$/);
    expect(labelFor(choices, MAP_KEY, maps[0].value)).toBe(maps[0].label);
    const skins = childChoices(choices, HERO_KEY, 'Tracer', 'datatool.ux.valid_skin_names');
    expect(skins.length).toBeGreaterThan(10);
    const allSprays = choicesFor(choices, 'datatool.ux.valid_spray_names');
    expect(allSprays.length).toBeGreaterThan(skins.length / 2);
  });
});

describe('log', () => {
  it('classifies lines and tracks phases', () => {
    expect(classifyLine('[Core] Execution finished in 00:00:23')).toBe('success');
    expect(classifyLine('[Query] Found nothing matching your query of "Tracer|skin=X"')).toBe('error');
    expect(classifyLine('[GUIDNames] Failed to parse line: 1AFO,078')).toBe('warn');
    expect(classifyLine('Processing unlocks for Tracer')).toBe('step');
    expect(classifyLine('\tExtracting skin X')).toBe('detail');
    expect(classifyLine('   at DataTool.Program.Main()')).toBe('error');
    let p = nextPhase('starting', '[CASC] Text Language: enUS');
    expect(p).toBe('loading');
    p = nextPhase(p, '[Core] Tooling...');
    expect(p).toBe('working');
    expect(parseGameBuild('[CASC] Overwatch build prometheus-2_25_0_0-154088')).toBe('2.25.0.0.154088');
  });

  it('diagnoses known problems', () => {
    const d = diagnose([
      '[CASC] This version of DataTool does not support this version of Overwatch.',
      '[Query] Found nothing matching your query of "Tracer|skin=Overwatch 1"',
      '[SpellCheck] Did you mean: "Tracer|skin=Overwatch Classic" ?',
    ]);
    expect(d.map((x) => x.kind)).toEqual(['update', 'query']);
    expect(d[1].suggestions).toEqual([{ query: 'Tracer|skin=Overwatch 1', suggestion: 'Tracer|skin=Overwatch Classic' }]);
  });
});
