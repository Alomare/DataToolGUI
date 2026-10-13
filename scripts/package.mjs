// Builds the portable release: dist/DataToolGUI-<version>-windows-x64/ (+ .zip).
//
//   npm run tauri build -- --no-bundle   (builds the exe)
//   npm run package                      (assembles the folder and zip)
//
// Options:
//   --with-datatool [tag]   also bundle a DataTool release (default: latest).
//                           Without it the app downloads DataTool on first start,
//                           which keeps the zip small and never stale.
//   --no-zip

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const has = (name) => args.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  const v = i >= 0 ? args[i + 1] : undefined;
  return v && !v.startsWith('--') ? v : fallback;
};

const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const exe = ['DataToolGUI.exe', 'datatoolgui.exe'].map((n) => join(root, 'src-tauri', 'target', 'release', n)).find((p) => existsSync(p));
if (!exe) {
  console.error('Release exe not found. Run: npm run tauri build -- --no-bundle');
  process.exit(1);
}

const name = `DataToolGUI-${version}-windows-x64`;
const dist = join(root, 'dist');
const out = join(dist, name);
const cache = join(dist, 'cache');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
mkdirSync(cache, { recursive: true });

copyFileSync(exe, join(out, 'DataToolGUI.exe'));
copyFileSync(join(root, 'LICENSE'), join(out, 'LICENSE.txt'));

let bundled = null;
if (has('with-datatool')) {
  const tag = opt('with-datatool', 'latest');
  const headers = { 'User-Agent': 'DataToolGUI-packager', Accept: 'application/vnd.github+json' };
  const api =
    tag === 'latest'
      ? 'https://api.github.com/repos/overtools/OWLib/releases/latest'
      : `https://api.github.com/repos/overtools/OWLib/releases/tags/${encodeURIComponent(tag)}`;
  const release = await (await fetch(api, { headers })).json();
  const asset = release.assets?.find((a) => a.name === 'toolchain-release.zip');
  if (!asset) {
    console.error(`No toolchain-release.zip in DataTool release ${release.tag_name ?? tag}`);
    process.exit(1);
  }
  const zip = join(cache, `${release.tag_name.replace(/[^\w.+-]/g, '_')}.zip`);
  if (!existsSync(zip) || statSync(zip).size !== asset.size) {
    console.log(`Downloading DataTool ${release.tag_name} (${(asset.size / 1048576).toFixed(1)} MB)…`);
    const res = await fetch(asset.browser_download_url, { headers: { 'User-Agent': headers['User-Agent'] } });
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  }
  const core = join(out, 'datatool', release.tag_name.replace(/[^\w.+-]/g, '_'));
  mkdirSync(core, { recursive: true });
  execFileSync('tar', ['-xf', zip, '-C', core], { stdio: 'inherit' });
  writeFileSync(
    join(core, '.datatoolgui.json'),
    JSON.stringify(
      {
        tag: release.tag_name,
        title: release.name,
        publishedAt: release.published_at,
        notes: release.body,
        url: release.html_url,
        installedAt: new Date().toISOString(),
        source: 'github',
      },
      null,
      2,
    ),
  );
  bundled = release.tag_name;
}

writeFileSync(
  join(out, 'README.txt'),
  `DataTool GUI ${version}
==================

A portable graphical front end for DataTool (overtools/OWLib), the tool that
extracts models, textures, sounds, maps and data from Overwatch.

Start:   double-click DataToolGUI.exe
Needs:   Windows 10 or 11 (uses the built-in Microsoft Edge WebView2)
Install: nothing. Everything stays in this folder:
           datatool\\   DataTool versions${bundled ? ` (${bundled} included)` : ' (downloaded on first start)'}
           data\\       your settings, presets and cached game names

Move or copy the whole folder anywhere. Every Overwatch patch needs a new
DataTool release: the app checks for one on start and installs it in one click
(Settings > DataTool), keeping older versions for rollback.

Close Overwatch and Battle.net while extracting.
Import models and maps into Blender with io_scene_owm:
https://github.com/overtools/io_scene_owm

DataTool: https://github.com/overtools/OWLib
Not affiliated with Blizzard Entertainment.
`.replace(/\n/g, '\r\n'),
);

console.log(`Folder: ${out}`);

if (!has('no-zip')) {
  const zip = join(dist, `${name}.zip`);
  rmSync(zip, { force: true });
  const bsdtar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
  if (existsSync(bsdtar)) {
    execFileSync(bsdtar, ['-a', '-c', '-f', zip, '-C', dist, name], { stdio: 'inherit' });
  } else {
    execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${out}' -DestinationPath '${zip}'`], { stdio: 'inherit' });
  }
  console.log(`Zip:    ${zip} (${(statSync(zip).size / 1048576).toFixed(1)} MB)`);
}
