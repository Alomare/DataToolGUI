// Typed wrappers around the Rust commands and events.

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface AppPaths {
  root: string;
  exeDir: string;
  cores: string;
  data: string;
  cache: string;
  results: string;
  portable: boolean;
}

export interface AppInfo {
  version: string;
  os: string;
  arch: string;
  paths: AppPaths;
}

export interface CaptureResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modified: number;
}

export interface Release {
  tag_name: string;
  name: string | null;
  published_at: string | null;
  html_url: string;
  body: string | null;
  prerelease: boolean;
  draft: boolean;
  assets: { name: string; browser_download_url: string; size: number }[];
}

/** What we record next to an installed DataTool build. */
export interface CoreManifest {
  tag: string;
  title?: string;
  publishedAt?: string | null;
  notes?: string | null;
  url?: string;
  installedAt: string;
  source: 'github' | 'zip';
}

export interface CoreInfo {
  name: string;
  dir: string;
  exe: string;
  tankview: string | null;
  manifest: CoreManifest | null;
  argsFile: string | null;
  managed: boolean;
}

export interface GameInstall {
  path: string;
  launcher: 'steam' | 'battlenet' | 'unknown';
  source: string;
  version: string | null;
  product: string | null;
}

export interface InstallCheck {
  exists: boolean;
  looksValid: boolean;
  install: GameInstall | null;
  message: string | null;
}

export const appInfo = () => invoke<AppInfo>('app_info');

export const readText = (path: string) => invoke<string | null>('read_text', { path });
export const writeText = (path: string, contents: string) => invoke<void>('write_text', { path, contents });
export const copyFile = (from: string, to: string) => invoke<void>('copy_file', { from, to });
export const removeFile = (path: string) => invoke<void>('remove_file', { path });
export const pathExists = (path: string) => invoke<boolean>('path_exists', { path });
export const makeDir = (path: string) => invoke<void>('make_dir', { path });
export const listDir = (path: string) => invoke<DirEntry[]>('list_dir', { path });
export const pruneDir = (path: string, keep: number) => invoke<number>('prune_dir', { path, keep });

export const runCapture = (program: string, args: string[], cwd?: string) =>
  invoke<CaptureResult>('run_capture', { program, args, cwd: cwd ?? null });

export const startJob = (id: string, program: string, args: string[], opts: { cwd?: string; watchDir?: string; stdoutFile?: string } = {}) =>
  invoke<number>('start_job', {
    id,
    program,
    args,
    cwd: opts.cwd ?? null,
    watchDir: opts.watchDir ?? null,
    stdoutFile: opts.stdoutFile ?? null,
  });

export const stopJob = (id: string) => invoke<boolean>('stop_job', { id });
export const launch = (program: string, args: string[] = []) => invoke<void>('launch', { program, args });

export const listReleases = (repo: string, count = 30) => invoke<Release[]>('list_releases', { repo, count });
export const downloadFile = (id: string, url: string, dest: string) => invoke<void>('download_file', { id, url, dest });
export const cancelDownload = (id: string) => invoke<void>('cancel_download', { id });
export const listCores = () => invoke<CoreInfo[]>('list_cores');
export const openCore = (path: string) => invoke<CoreInfo>('open_core', { path });
export const installCore = (zip: string, name: string, manifest: CoreManifest) => invoke<CoreInfo>('install_core', { zip, name, manifest });
export const removeCore = (name: string) => invoke<void>('remove_core', { name });
export const deleteArgsFile = (path: string) => invoke<void>('delete_args_file', { path });

export const detectInstalls = () => invoke<GameInstall[]>('detect_installs');
export const checkInstall = (path: string) => invoke<InstallCheck>('check_install', { path });

export interface JobOutputEvent {
  id: string;
  lines: { stream: 'stdout' | 'stderr'; line: string }[];
}
export interface JobFilesEvent {
  id: string;
  files: number;
  bytes: number;
}
export interface JobExitEvent {
  id: string;
  code: number | null;
  cancelled: boolean;
  error: string | null;
}
export interface DownloadProgressEvent {
  id: string;
  received: number;
  total: number | null;
}

export const onJobOutput = (f: (e: JobOutputEvent) => void): Promise<UnlistenFn> => listen<JobOutputEvent>('job-output', (e) => f(e.payload));
export const onJobFiles = (f: (e: JobFilesEvent) => void): Promise<UnlistenFn> => listen<JobFilesEvent>('job-files', (e) => f(e.payload));
export const onJobExit = (f: (e: JobExitEvent) => void): Promise<UnlistenFn> => listen<JobExitEvent>('job-exit', (e) => f(e.payload));
export const onDownloadProgress = (f: (e: DownloadProgressEvent) => void): Promise<UnlistenFn> =>
  listen<DownloadProgressEvent>('download-progress', (e) => f(e.payload));

export function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  return typeof e === 'string' ? e : JSON.stringify(e);
}
