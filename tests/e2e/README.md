# End-to-end tests

These drive the real app (the Rust backend, WebView2, and DataTool itself)
with Playwright over the Chrome DevTools Protocol.

```sh
npm run test:e2e                         # builds a debug app, runs everything
npm run test:e2e -- integrity            # one spec file
npm run test:e2e -- -g "regression"      # tests matching a name
E2E_EXE=src-tauri/target/e2e/debug/DataToolGUI.exe npm run test:e2e   # skip the build
npx playwright show-report test-results/e2e-report
```

The app runs isolated: `DATATOOLGUI_HOME` points it at a temporary folder,
with its own settings and browser profile, so it never touches your settings
and can run while you have the app open. Every test starts from the same
seeded settings (see `defaultSeed` in `fixtures.ts`).

| Variable | Default |
|---|---|
| `E2E_EXE` | build `src-tauri/target/e2e/debug/DataToolGUI.exe` |
| `E2E_DATATOOL` | newest DataTool installed by the dev app, else the latest release (cached in `.cache/`) |
| `E2E_GAME` | common Steam/Battle.net paths; tests that read game files are skipped without one |
| `E2E_KEEP=1` | keep the temporary data folder |

## What's checked

- After each interaction, `App.intact()` checks that the page itself never
  scrolls, the app fills the window, nothing is wider than the window or
  spills out of its box, and no notification covers Run or Stop. Any console
  error fails the test.
- `integrity.spec.ts`: every Settings control, keyboard focus, every page at
  980×640, 1360×900 and 1920×1080, long values, no-DataTool state, a corrupt
  settings file.
- `modes.spec.ts`: every mode opens and builds its command; every extract,
  list and general option changes the command and resets; list output
  choices, overrides, validation, presets, persistence.
- `query.spec.ts`: the query builder, text mode, validation, name pickers fed
  from the game.
- `workflow.spec.ts` (needs the game): real listing, extraction, browsing the
  files, stopping, DataTool's spelling suggestions, a wrong game folder.
- `zz-close.spec.ts` (runs last): closing asks first while a job runs.

When fixing a UI bug, add a test that fails without the fix first.
