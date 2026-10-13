<script lang="ts">
  import { openPath, openUrl } from '@tauri-apps/plugin-opener';
  import CorePanel from './CorePanel.svelte';
  import GamesPanel from './GamesPanel.svelte';
  import FlagControl from '$lib/components/mode/FlagControl.svelte';
  import Field from '$lib/components/ui/Field.svelte';
  import PathInput from '$lib/components/ui/PathInput.svelte';
  import Segmented from '$lib/components/ui/Segmented.svelte';
  import Toggle from '$lib/components/ui/Toggle.svelte';
  import { cores } from '$lib/core.svelte';
  import { app, type Theme } from '$lib/state.svelte';

  let globals = $derived(cores.schema.global.flags.filter((f) => app.prefs.showAdvanced || !f.hidden));
</script>

<div class="settings">
  <div class="page-head"><h1>Settings</h1></div>

  <CorePanel />
  <GamesPanel />

  <section class="panel">
    <header><h2>Defaults for every run</h2></header>
    <div class="col">
      <Field label="Output folder" hint="Where extract modes save files unless a task says otherwise.">
        <PathInput bind:value={app.prefs.outputDir} mode="directory" placeholder="Choose a folder" />
      </Field>
      <div class="flags">
        {#each globals as f (f.name)}
          <FlagControl
            flag={f}
            value={app.prefs.globalFlags[f.name]}
            onchange={(v) => {
              if (v === undefined) delete app.prefs.globalFlags[f.name];
              else app.prefs.globalFlags[f.name] = v;
            }}
          />
        {/each}
      </div>
      <p class="tiny faint">Each mode page can override these for a single task.</p>
    </div>
  </section>

  <section class="panel">
    <header><h2>Interface</h2></header>
    <div class="col">
      <div class="row" role="group" aria-label="Theme">
        <span class="small" style="font-weight: 600; color: var(--text-2)">Theme</span>
        <span class="spacer"></span>
        <Segmented
          bind:value={app.prefs.theme}
          options={[
            { value: 'system' as Theme, label: 'System' },
            { value: 'light' as Theme, label: 'Light' },
            { value: 'dark' as Theme, label: 'Dark' },
          ]}
        />
      </div>
      <Toggle bind:checked={app.prefs.showAdvanced} label="Show advanced & debug modes and options" help="Modes and flags DataTool doesn't list in its own help." />
      <Toggle
        bind:checked={app.prefs.autoLoadChoices}
        label="Read names from the game for pickers"
        help="When a mode with a query opens, read hero, unlock and map names from the game (about 10 seconds, then cached)."
      />
      <Toggle bind:checked={app.prefs.openWhenDone} label="Open the output folder when an extraction finishes" />
    </div>
  </section>

  <section class="panel about">
    <header><h2>About</h2></header>
    <p class="small">
      DataTool GUI {app.info?.version} — a front end for <button class="link-btn" onclick={() => openUrl('https://github.com/overtools/OWLib')}>DataTool</button> by the overtools
      team. Not affiliated with Blizzard Entertainment.
    </p>
    <p class="small muted">
      Models and maps import into Blender with the
      <button class="link-btn" onclick={() => openUrl('https://github.com/overtools/io_scene_owm')}>io_scene_owm</button> add-on.
    </p>
    {#if app.info}
      <p class="small muted">
        {app.info.paths.portable ? 'Portable: everything is stored next to the app in' : 'Data folder:'}
        <button class="link-btn" onclick={() => openPath(app.info!.paths.root)}>{app.info.paths.root}</button>
      </p>
    {/if}
  </section>
</div>

<style>
  .settings {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 920px;
    margin: 0 auto;
  }
  .flags {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 2px 28px;
  }
</style>
