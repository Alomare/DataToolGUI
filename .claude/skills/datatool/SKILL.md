---
name: datatool
description: How DataTool (overtools/OWLib) is invoked, parsed and released: CLI grammar, query syntax, self-description modes, log shapes and failure signatures. Use when changing how this app builds DataTool commands, reads its output, or handles a new DataTool release.
---

# DataTool facts this app depends on

Source: github.com/overtools/OWLib, folder `DataTool/` (C#, .NET 10). Verified against v2.25.0.0+1151.

## Releases
- GitHub releases on `overtools/OWLib`, tag `v<assembly version>+<CI run>` (e.g. `v2.25.0.0+1151`). The assembly version alone is NOT unique (two `2.22.1.0` builds exist): compare version + CI number (`coreKey` in `src/lib/core.svelte.ts`).
- One asset: `toolchain-release.zip`, a self-contained win-x64 build with `DataTool.exe` at the zip root (also TankView.exe, a WPF viewer).
- Release notes start with `**Supports Overwatch 2.25.0.0.154088**`.
- The tool prints `[Core] DataTool v2.25.0.0+1151+68397365` (version + CI number + commit) as its first line.

## Command line (`DataTool/Flag/FlagParser.cs`)
- `DataTool.exe <game dir> <mode> [out dir for ExtractFlags modes] [queries...] [--flags]`
- Flags must be `--name=value`. `--name value` makes `value` a positional. Booleans: `--name` = true, `--name=false` turns default-on flags off.
- Any `"` in any argument makes DataTool refuse the whole command (Program.cs).
- `DataTool.args` next to the exe (written by `--args-save`) is prepended to every run. The app warns and offers to delete it.
- Env var `DATATOOL_OVERWATCH_DIR` overrides the game dir. The app removes it from child envs.
- Exit code is 0 even after usage errors. Success = exit 0 AND a `[Core] Execution finished in` line.

## Self-description (the UI is built from these)
- `DataTool . util-tool-info --json --out=<file>`: modes grouped by flag class, flags (no defaults, no hidden flags, no "IsSensitive" modes), query types/tags. Needs no game files. This is the app's only source of modes and flags; hidden flags and sensitive modes are deliberately not offered (users can still type them as extra arguments).
- `DataTool --help`: prints "Positional directory is required" then flag tables `--flag | help | default`. The defaults are scraped from these until tool info reports them (a maintainer offered to add them to the metadata if asked).
- `DataTool <game> util-dynamic-choices --json --out=<file>` (about 5 s, reads game): `Types[key].Choices[{QueryName, DisplayName, Children}]`. Keys: `datatool.ux.valid_hero_names` (children per unlock type), `valid_npc_names`, `valid_map_names` (QueryName = hex map index), `valid_owl_teams`.

## Query syntax (`DataTool/IQueryParser.cs`)
`{target}|{type}=({tag}={value},{tag}={value}),{item},!{excluded}|{type}=...`
- `*` = all. A type with no items = all of it. `!` excludes (items and tag values).
- Targets: hero/NPC display name, or hex GUID index (extract-unlocks/npcs and maps accept the index). Names are matched in the loaded text language, case-insensitively.
- Names containing `,` or `|` can't be queried.
- Query required: extract-unlocks, extract-npcs, extract-hero-voice, extract-maps, extract-anything. Optional (none = everything): conversations, sprays, player icons, name cards, charms, souvenirs.

## Log shapes
- `[CASC] Overwatch build prometheus-2_25_0_0-154088` gives the game version (Steam installs have no `.build.info`).
- Phases: `[CASC] Initializing...` → `[CASC] Ready` → `[Core] Tooling...` → work lines (`Processing unlocks for Tracer`, tab-indented sub-steps) → `[Core] Execution finished in`.
- Most modes print no progress, so the app counts files written to the output dir instead.
- Failure signatures: `This version of DataTool does not support this version of Overwatch`, `Error reading game files! Is Overwatch is running?`, `Error initializing CASC!`, `[Query] Found nothing matching your query of "x"` followed by `[SpellCheck] Did you mean: "y" ?`, `Positional "x" is required`, `Value x is invalid for flag y`.
- `[GUIDNames] Failed to parse line ...` is benign noise.

## Testing against the real tool
A Steam install is at `C:\Program Files (x86)\Steam\steamapps\common\Overwatch`.
- `npm run test:e2e` runs the Playwright suite against an isolated debug build (`tests/e2e/README.md`). Add a failing test before fixing a UI bug; `App.intact()` checks layout integrity.
- Ad hoc driving: start `npm run tauri dev` with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`, then `chromium.connectOverCDP('http://127.0.0.1:9222')`. Stopping that background task can orphan Vite on port 1420; kill it before restarting.
