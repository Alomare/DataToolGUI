// The job queue: DataTool runs one at a time (each one reads the whole game
// index, so running several at once mostly competes for the disk).

import { openPath } from '@tauri-apps/plugin-opener';

import * as backend from './backend';
import { cores } from './core.svelte';
import { buildArgs, formatCommand, type TaskForm } from './datatool/args';
import { classifyLine, crashMessage, diagnose, nextPhase, parseGameBuild, type Diagnosis, type LineKind, type Phase } from './datatool/log';
import type { Mode } from './datatool/schema';
import { app } from './state.svelte';
import { clone, joinPath, safeName, uid } from './util';

export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

export interface LogLine {
  kind: LineKind;
  text: string;
  /** Line number in the whole log (stable across trimming, for keyed rendering). */
  n: number;
}

export interface Job {
  id: string;
  title: string;
  mode: string;
  kind: Mode['kind'];
  task: TaskForm;
  program: string;
  args: string[];
  command: string;
  game: string;
  /** Folder to open when done (extract modes). */
  output: string | null;
  /** JSON written by a list mode, shown in the app. */
  resultFile: string | null;
  /** stdout saved to a file (text list output). */
  stdoutFile: string | null;
  status: JobStatus;
  phase: Phase;
  /** Latest top-level and nested step from the log ("Processing unlocks for Tracer"). */
  step: string;
  detail: string;
  lines: LogLine[];
  /** Lines dropped from the start to keep memory bounded. */
  dropped: number;
  errors: number;
  warnings: number;
  files: number;
  bytes: number;
  gameBuild: string | null;
  code: number | null;
  error: string | null;
  diagnosis: Diagnosis[];
  startedAt: number | null;
  endedAt: number | null;
}

const LOG_LIMIT = 20000;

class JobQueue {
  jobs = $state<Job[]>([]);
  private listening = false;

  get active(): Job | undefined {
    return this.jobs.find((j) => j.status === 'running');
  }

  get pending(): number {
    return this.jobs.filter((j) => j.status === 'queued' || j.status === 'running').length;
  }

  async init() {
    if (this.listening) return;
    this.listening = true;
    await backend.onJobOutput((e) => {
      const job = this.find(e.id);
      if (job) this.ingest(job, e.lines);
    });
    await backend.onJobFiles((e) => {
      const job = this.find(e.id);
      if (job) {
        job.files = e.files;
        job.bytes = e.bytes;
      }
    });
    await backend.onJobExit((e) => {
      const job = this.find(e.id);
      if (job) this.finish(job, e);
    });
  }

  private find(id: string): Job | undefined {
    return this.jobs.find((j) => j.id === id);
  }

  private ingest(job: Job, batch: { stream: string; line: string }[]) {
    const added: LogLine[] = [];
    let n = job.dropped + job.lines.length;
    for (const { line } of batch) {
      const kind = classifyLine(line);
      added.push({ kind, text: line, n: n++ });
      if (kind === 'error') job.errors++;
      else if (kind === 'warn') job.warnings++;
      job.phase = nextPhase(job.phase, line);
      if (job.phase === 'working') {
        if (kind === 'step') {
          job.step = line.trim();
          job.detail = '';
        } else if (kind === 'detail') {
          job.detail = line.trim();
        }
      }
      const build = job.gameBuild ? null : parseGameBuild(line);
      if (build) {
        job.gameBuild = build;
        app.setGameBuild(job.game, build);
      }
    }
    job.lines.push(...added);
    if (job.lines.length > LOG_LIMIT) {
      const cut = job.lines.length - LOG_LIMIT;
      job.lines.splice(0, cut);
      job.dropped += cut;
    }
  }

  private finish(job: Job, e: backend.JobExitEvent) {
    job.endedAt = Date.now();
    job.code = e.code;
    const texts = job.lines.map((l) => l.text);
    job.diagnosis = diagnose(texts);
    // DataTool exits with 0 after printing usage errors, so a clean run is
    // one that reached "Execution finished".
    if (e.cancelled) job.status = 'cancelled';
    else if (e.code === 0 && job.phase === 'finished') job.status = 'done';
    else {
      job.status = 'failed';
      job.error =
        e.error ??
        job.diagnosis[0]?.title ??
        crashMessage(texts) ??
        (e.code === 0 ? 'DataTool stopped without finishing. See the log.' : `DataTool exited with code ${e.code}`);
    }
    app.record(job.task, job.status === 'done' ? 'done' : job.status === 'cancelled' ? 'cancelled' : 'failed');

    if (job.status === 'done') {
      const queryMiss = job.diagnosis.find((d) => d.kind === 'query');
      if (job.kind === 'extract' && job.output) {
        const what = job.files ? `${job.files.toLocaleString()} files` : 'no new files';
        app.notify(`${job.title} finished: ${what}${queryMiss ? ' (some names didn\'t match)' : ''}`, queryMiss || !job.files ? 'info' : 'success', {
          label: 'Open folder',
          run: () => void openPath(job.output!),
        });
        if (app.prefs.openWhenDone && job.files) void openPath(job.output).catch(() => {});
      } else {
        app.notify(`${job.title} finished`, 'success', { label: 'View', run: () => this.show(job.id) });
      }
    } else if (job.status === 'failed') {
      app.notify(`${job.title} failed: ${job.error}`, 'error', { label: 'Details', run: () => this.show(job.id) });
    }
    this.next();
  }

  show(id: string) {
    app.selectedJob = id;
    app.page = 'jobs';
  }

  /** Build the command for a task and queue it. Returns errors instead when the task isn't runnable. */
  addTask(task: TaskForm): { job?: Job; errors: string[] } {
    const core = cores.active;
    if (!core) return { errors: ['Install DataTool first (Settings → DataTool).'] };
    const mode = cores.schema.modes.find((m) => m.keyword === task.mode);
    if (!mode) return { errors: [`This DataTool build has no "${task.mode}" mode.`] };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const resultBase = joinPath(app.info!.paths.results, `${safeName(mode.keyword)}-${stamp}`);
    const wantsJson = mode.kind === 'list' && mode.supportsJson && task.listOutput === 'view';
    const resultFile = wantsJson ? `${resultBase}.json` : null;
    const built = buildArgs({ schema: cores.schema, mode, task, game: app.prefs.game, globalFlags: app.prefs.globalFlags, resultFile: resultFile ?? undefined });
    if (built.errors.length) return { errors: built.errors };
    const stdoutFile = mode.kind === 'list' && !wantsJson && task.listOutput !== 'file' ? `${resultBase}.txt` : null;
    const output = mode.kind === 'extract' ? task.output.trim() : null;

    const job: Job = {
      id: uid('job'),
      title: mode.label,
      mode: mode.keyword,
      kind: mode.kind,
      task: clone(task),
      program: core.exe,
      args: built.args,
      command: formatCommand(core.exe, built.args),
      game: app.prefs.game,
      output,
      resultFile,
      stdoutFile,
      status: 'queued',
      phase: 'starting',
      step: '',
      detail: '',
      lines: [],
      dropped: 0,
      errors: 0,
      warnings: 0,
      files: 0,
      bytes: 0,
      gameBuild: null,
      code: null,
      error: null,
      diagnosis: [],
      startedAt: null,
      endedAt: null,
    };
    this.jobs.push(job);
    void this.next();
    // Keep the result list from growing forever.
    void backend.pruneDir(app.info!.paths.results, 40).catch(() => {});
    return { job: this.find(job.id), errors: [] };
  }

  private async next() {
    if (this.active) return;
    const job = this.jobs.find((j) => j.status === 'queued');
    if (!job) return;
    job.status = 'running';
    job.startedAt = Date.now();
    try {
      if (job.output) await backend.makeDir(job.output);
      await backend.startJob(job.id, job.program, job.args, {
        watchDir: job.output ?? undefined,
        stdoutFile: job.stdoutFile ?? undefined,
      });
    } catch (e) {
      job.status = 'failed';
      job.error = backend.errorText(e);
      job.endedAt = Date.now();
      void this.next();
    }
  }

  async stop(id: string) {
    const job = this.find(id);
    if (!job) return;
    if (job.status === 'queued') {
      job.status = 'cancelled';
      return;
    }
    if (job.status === 'running') await backend.stopJob(id);
  }

  retry(id: string) {
    const job = this.find(id);
    if (!job) return;
    const r = this.addTask(job.task);
    if (r.job) app.selectedJob = r.job.id;
    else app.notify(r.errors[0], 'error');
  }

  clearFinished() {
    this.jobs = this.jobs.filter((j) => j.status === 'queued' || j.status === 'running');
  }

  remove(id: string) {
    this.jobs = this.jobs.filter((j) => j.id !== id || j.status === 'running');
  }
}

export const queue = new JobQueue();
