# DataTool GUI

A portable desktop app for [DataTool](https://github.com/overtools/OWLib) (overtools/OWLib), the tool that extracts models, textures, sounds, maps and data from Overwatch, so you never have to use the command line.

- **Portable.** One folder, no installer, no .NET to install. Unzip and run `DataToolGUI.exe`. DataTool, settings and caches stay in that folder.
- **Complete.** Every DataTool mode and flag, including the unlisted debug modes and hidden options behind an "advanced" switch, plus free-form extra arguments.
- **Always current.** Every Overwatch patch needs a new DataTool release. The app checks GitHub on start, installs a release in one click (or automatically) and keeps older versions for rollback. The forms are built from what the installed DataTool reports about itself, so new modes and flags appear without an app update.

## Features

| Area | What you can do |
|---|---|
| Setup | Finds Steam and Battle.net installs, installs DataTool, first-run checklist |
| Queries | Visual builder for DataTool's query syntax: hero, then types (skin, spray, emote…) with items, exclusions and rarity/event/league-team filters. Hero, unlock and map names are read from your game for search-as-you-type pickers. Text mode, examples, inline validation |
| Options | Every extract/list/general flag, grouped (textures, models, sound, voice grouping, raw…), with defaults, help and per-task overrides of app-wide defaults (language, region, deduplication) |
| Running | Job queue, live phase and current item, files written and size so far, colored and filterable log, stop, run again, copy the exact command |
| Diagnosis | Explains known failures: DataTool too old for the game, game files in use, CASC errors, names that didn't match (with DataTool's "did you mean" as one-click fixes), missing languages |
| Data | List modes open as sortable, searchable tables, or as a JSON tree; save or copy the JSON |
| Files | Browse output with thumbnails and previews of images, sounds and text |
| DataTool versions | Release list with notes and supported game version, install from GitHub, a zip (e.g. a Discord build) or an existing folder; switch, roll back, prune; warns when the game is newer than DataTool; launches TankView |
| Quality of life | Presets, recent runs, quick-start tiles, light/dark theme |

## Download

Get `DataToolGUI-<version>-windows-x64.zip` from the Releases page, unzip it anywhere and run `DataToolGUI.exe`. It needs Windows 10 or 11 (the Microsoft Edge WebView2 runtime ships with both). On first start the app downloads the latest DataTool (about 75 MB).

Close Overwatch and Battle.net while extracting. Import models and maps into Blender with [io_scene_owm](https://github.com/overtools/io_scene_owm).

## Building from source

Requirements: [Node.js](https://nodejs.org) 20+, [Rust](https://rustup.rs) (MSVC toolchain) and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
npm install
npm run tauri dev                      # run in development
npm test                               # frontend unit tests
cargo test --manifest-path src-tauri/Cargo.toml
npm run check                          # type-check
npm run tauri build -- --no-bundle     # release exe
npm run package                        # dist/DataToolGUI-<version>-windows-x64(.zip)
npm run package -- --with-datatool     # same, with the latest DataTool bundled
```

In development, the portable folders (`datatool/`, `data/`) are created next to the dev executable in `src-tauri/target/debug/`.

### When DataTool changes

Nothing is needed for a normal DataTool update. The app reads the modes, flags and query syntax from `DataTool util-tool-info` and the defaults from `DataTool --help`.

`src/lib/datatool/catalog.json` adds what that output leaves out (debug modes, hidden flags, aliases). Regenerate it from the OWLib source when DataTool adds those:

```sh
npm run catalog                        # latest OWLib master
npm run catalog -- --ref v2.26.0.0+1160
```

Friendly names, categories and help live in `src/lib/datatool/extras.ts`. They're optional: unknown modes and flags still show up with DataTool's own wording.

### Project layout

```
src/lib/datatool/schema.ts   merges util-tool-info + --help + catalog into the modes/flags the UI shows
src/lib/datatool/query.ts    DataTool's query syntax: parse, serialize, validate
src/lib/datatool/args.ts     task → command line
src/lib/datatool/log.ts      log line severity, phases, failure diagnosis
src/lib/datatool/choices.ts  util-dynamic-choices → picker options
src/lib/core.svelte.ts       DataTool versions: releases, install, switch, prune
src/lib/jobs.svelte.ts       job queue
src/lib/components/          UI (mode page, query builder, jobs, results, files, settings)
src-tauri/src/process.rs     running DataTool, batched log events, output file counter
src-tauri/src/cores.rs       GitHub releases, downloads, zip install
src-tauri/src/detect.rs      finding Overwatch installs (Steam, Battle.net)
scripts/gen-catalog.mjs      catalog.json from the OWLib source
scripts/package.mjs          portable zip
```

## License

MIT, see [LICENSE](LICENSE). DataTool is © the overtools contributors (MIT). This project is not affiliated with Blizzard Entertainment.
