// Generates src/lib/datatool/catalog.json from the OWLib (DataTool) source.
//
// DataTool can describe itself (`util-tool-info`), and the app uses that at
// runtime, but that output leaves out "sensitive" (debug) modes, hidden flags,
// aliases and defaults. This catalog fills those gaps. Re-run it when a
// DataTool release adds modes or flags:
//
//   npm run catalog                       (clones/updates OWLib into .cache/)
//   npm run catalog -- --src path/to/OWLib
//   npm run catalog -- --ref v2.25.0.0+1151

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

let src = opt('src');
const ref = opt('ref');
if (!src) {
  src = join(root, '.cache', 'OWLib');
  const git = (...a) => execFileSync('git', a, { stdio: 'inherit' });
  if (!existsSync(join(src, '.git'))) {
    mkdirSync(dirname(src), { recursive: true });
    git('clone', '--filter=blob:none', 'https://github.com/overtools/OWLib', src);
  } else {
    git('-C', src, 'fetch', '--tags', 'origin');
  }
  git('-C', src, 'checkout', '--detach', ref ?? 'origin/HEAD');
}

const dataTool = join(src, 'DataTool');
if (!existsSync(dataTool)) {
  console.error(`No DataTool folder in ${src}`);
  process.exit(1);
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.cs')) out.push(p);
  }
  return out;
}

/** From `open` (index of an opening paren), return the index of its match. */
function matchParen(text, open) {
  let depth = 0;
  let inStr = false;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Split a C# attribute argument list on top-level commas. */
function splitArgs(s) {
  const parts = [];
  let depth = 0;
  let inStr = false;
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      cur += c;
      if (c === '\\') cur += s[++i];
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    if ('([{'.includes(c)) depth++;
    if (')]}'.includes(c)) depth--;
    if (c === ',' && depth === 0) {
      parts.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

function strings(s) {
  return [...s.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
}

function value(raw) {
  const v = raw.trim();
  if (v === 'true' || v === 'false') return v === 'true';
  if (v === 'null') return null;
  if (/^-?\d+$/.test(v)) return Number(v);
  if (v.startsWith('"')) return strings(v)[0];
  if (v.startsWith('new') || v.startsWith('[')) return strings(v);
  const t = /^typeof\((\w+)\)$/.exec(v);
  if (t) return { type: t[1] };
  return v;
}

function parseAttrArgs(body) {
  const positional = [];
  const named = {};
  for (const part of splitArgs(body)) {
    const m = /^(\w+)\s*=\s*([\s\S]+)$/.exec(part);
    if (m && !part.startsWith('"')) named[m[1]] = value(m[2]);
    else positional.push(value(part));
  }
  return { positional, named };
}

const files = walk(dataTool);
const tools = [];
const flagGroups = {};

// class name -> base types, to resolve IQueryParser through inheritance
// (e.g. extract-sprays -> ExtractUnlockType -> IQueryParser).
const bases = new Map();
for (const file of files) {
  for (const m of readFileSync(file, 'utf8').matchAll(/class\s+(\w+)(?:\([^)]*\))?\s*:\s*([\w\s,<>.]+?)\s*\{/g)) {
    bases.set(m[1], m[2].split(',').map((b) => b.trim().replace(/<.*$/, '')));
  }
}
function isQueryParser(cls, seen = new Set()) {
  if (seen.has(cls)) return false;
  seen.add(cls);
  const b = bases.get(cls) ?? [];
  return b.includes('IQueryParser') || b.some((x) => isQueryParser(x, seen));
}

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const rel = relative(src, file).replaceAll('\\', '/');

  // --- Tools ----------------------------------------------------------------
  for (const m of text.matchAll(/\[(Tool|ExtractTool|ListTool)\(/g)) {
    const open = m.index + m[0].length - 1;
    const close = matchParen(text, open);
    const { positional, named } = parseAttrArgs(text.slice(open + 1, close));
    const after = text.slice(close);
    const cls = /class\s+(\w+)/.exec(after)?.[1] ?? '';
    const flagsType =
      m[1] === 'ExtractTool' ? 'ExtractFlags' : m[1] === 'ListTool' ? 'ListFlags' : (named.CustomFlags?.type ?? null);
    const aliases = [...positional.slice(1), ...(Array.isArray(named.Aliases) ? named.Aliases : [])].filter(Boolean);
    tools.push({
      keyword: positional[0],
      aliases: [...new Set(aliases)].filter((a) => a !== positional[0]),
      name: named.Name ?? '',
      description: named.Description ?? '',
      flags: flagsType,
      sensitive: named.IsSensitive === true,
      noArchive: named.UtilNoArchiveNeeded === true,
      className: cls,
      queryParser: isQueryParser(cls),
      file: rel,
    });
  }

  // --- Flag classes ---------------------------------------------------------
  for (const m of text.matchAll(/(?:\[FlagInfo\(([^)]*)\)\]\s*)?(?:public\s+)?(?:abstract\s+)?class\s+(\w+)\s*:\s*(\w+)/g)) {
    const [, info, name, parent] = m;
    if (!/Flags$/.test(parent) && parent !== 'ICLIFlags') continue;
    const bodyOpen = text.indexOf('{', m.index + m[0].length);
    const bodyClose = matchParen(text, bodyOpen);
    const body = text.slice(bodyOpen, bodyClose);
    const flags = [];
    for (const f of body.matchAll(/\[CLIFlag\(/g)) {
      const open = f.index + f[0].length - 1;
      const close = matchParen(body, open);
      const { named } = parseAttrArgs(body.slice(open + 1, close));
      if (named.AllPositionals) continue;
      const rest = body.slice(close + 2);
      const decl = /^((?:\s*\[[^\]]*\]\s*)*)\s*public\s+([\w<>,\s?]+?)\s+(\w+)\s*;/.exec(rest);
      if (!decl) continue;
      const aliases = [...decl[1].matchAll(/\[Alias\("([^"]+)"\)\]/g)].map((a) => a[1]);
      const parser = Array.isArray(named.Parser) ? named.Parser[1] : null;
      const type = parser?.replace(/^CLIFlag/, '').toLowerCase() ?? 'string';
      flags.push({
        name: named.Flag,
        field: decl[3],
        aliases,
        help: named.Help ?? '',
        default: named.Default ?? null,
        needsValue: named.NeedsValue === true,
        type: type === 'boolean' ? 'boolean' : type,
        choices: Array.isArray(named.Valid) ? named.Valid : null,
        hidden: named.Hidden === true,
        required: named.Required === true,
        positional: typeof named.Positional === 'number' ? named.Positional : -1,
        csType: decl[2].trim(),
      });
    }
    const infoArgs = info ? parseAttrArgs(info).named : {};
    flagGroups[name] = {
      name,
      parent,
      title: infoArgs.Name ?? null,
      description: infoArgs.Description ?? null,
      file: rel,
      flags,
    };
  }
}

tools.sort((a, b) => a.keyword.localeCompare(b.keyword));

let commit = null;
let version = null;
try {
  commit = execFileSync('git', ['-C', src, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
} catch {}
const csproj = join(dataTool, 'DataTool.csproj');
if (existsSync(csproj)) version = /<Version>([^<]+)<\/Version>/.exec(readFileSync(csproj, 'utf8'))?.[1] ?? null;

const catalog = { generatedFrom: { repo: 'overtools/OWLib', commit, version }, flagGroups, tools };
const out = join(root, 'src', 'lib', 'datatool', 'catalog.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(catalog, null, 2) + '\n');
console.log(`${tools.length} modes, ${Object.keys(flagGroups).length} flag groups → ${relative(root, out)} (DataTool ${version}, ${commit})`);
