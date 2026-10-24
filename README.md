<p align="center">
  <img src="assets/logo/app-icon-256.png" alt="DataTool GUI logo" width="128" height="128" />
</p>

# DataTool GUI

A portable Windows app for [DataTool](https://github.com/overtools/OWLib) (overtools/OWLib), the tool that extracts models, textures, sounds, maps and data from Overwatch. It puts DataTool's command line behind forms.

There is no installer and no .NET to set up. Unzip the folder and run `DataToolGUI.exe`; DataTool, your settings and the caches all live in that folder.

Every DataTool mode and flag is available, including the unlisted debug modes and hidden options (behind an "advanced" switch), and you can add your own arguments on top.

Each Overwatch patch needs a new DataTool release. The app checks GitHub when it starts and installs a new release in one click, or on its own if you turn that on. Older versions stay installed so you can roll back. The forms are built from what the installed DataTool reports about itself, so new modes and flags show up without an app update.

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

Get `DataToolGUI-<version>-windows-x64.zip` from the [latest release](https://github.com/Alomare/DataToolGUI/releases/latest), unzip it anywhere and run `DataToolGUI.exe`. It needs Windows 10 or 11, which both ship with the Microsoft Edge WebView2 runtime it uses. On first start the app downloads the latest DataTool (about 75 MB).

The exe isn't code-signed, so Windows SmartScreen may stop it the first time. Click "More info", then "Run anyway".

Close Overwatch and Battle.net while extracting. To bring models and maps into Blender, use [io_scene_owm](https://github.com/overtools/io_scene_owm).

Right after an Overwatch patch, extractions fail until overtools publishes a DataTool release for the new build. The app tells you when that's the cause, and offers the new release as soon as it's out.

## Building from source

Requirements: [Node.js](https://nodejs.org) 20+, [Rust](https://rustup.rs) (MSVC toolchain) and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
npm install
npm run tauri dev                      # run in development
npm test                               # frontend unit tests
npm run test:e2e                       # end-to-end tests of the real app (see tests/e2e/README.md)
cargo test --manifest-path src-tauri/Cargo.toml
npm run check                          # type-check
npm run tauri build -- --no-bundle     # release exe
npm run package                        # dist/DataToolGUI-<version>-windows-x64(.zip)
npm run package -- --with-datatool     # same, with the latest DataTool bundled
```

In development, the portable folders (`datatool/`, `data/`) are created next to the dev executable in `src-tauri/target/debug/`, so `cargo clean` deletes them along with the build. Set `DATATOOLGUI_HOME` to use another folder instead. That folder also gets its own browser profile, so it can run next to a normal instance.

### When DataTool changes

A normal DataTool update needs no change here. The app reads the modes, flags and query syntax from `DataTool util-tool-info` and the defaults from `DataTool --help`.

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
