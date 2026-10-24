//! Running DataTool as a child process.
//!
//! - `run_capture`: short commands (tool info, help) whose output we need in
//!   full.
//! - jobs: extractions and listings that stream their log to the UI, can be
//!   killed, and optionally report how many files they have written so far
//!   (DataTool itself has no progress output for most modes).

use std::collections::{HashMap, HashSet};
use std::io::{BufWriter, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Don't flash a console window for each child on Windows.
pub fn hide_window(cmd: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(not(windows))]
    let _ = cmd;
}

fn build_command(program: &str, args: &[String], cwd: Option<&str>) -> Command {
    let mut cmd = Command::new(program);
    cmd.args(args)
        // DataTool replaces the game directory argument with this variable
        // when it's set, which would silently ignore the install picked in
        // the app.
        .env_remove("DATATOOL_OVERWATCH_DIR")
        .env("NO_COLOR", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let dir = cwd
        .filter(|d| !d.is_empty())
        .map(PathBuf::from)
        .or_else(|| Path::new(program).parent().map(Path::to_path_buf));
    if let Some(dir) = dir {
        cmd.current_dir(dir);
    }
    hide_window(&mut cmd);
    cmd
}

/// Remove ANSI CSI sequences (colors, cursor movement) and OSC sequences
/// (terminal hyperlinks) from a line of terminal output.
pub fn strip_ansi(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c != '\u{1b}' {
            out.push(c);
            continue;
        }
        match chars.peek() {
            Some('[') => {
                chars.next();
                for c in chars.by_ref() {
                    if ('@'..='~').contains(&c) {
                        break;
                    }
                }
            }
            Some(']') => {
                chars.next();
                while let Some(c) = chars.next() {
                    if c == '\u{7}' {
                        break;
                    }
                    if c == '\u{1b}' && chars.peek() == Some(&'\\') {
                        chars.next();
                        break;
                    }
                }
            }
            _ => {}
        }
    }
    out
}

/// Read a stream, splitting on both `\r` and `\n` (progress bars redraw with
/// `\r`), and hand each non-empty, ANSI-stripped line to `f`. Tabs are kept:
/// DataTool indents nested steps with them.
fn for_each_line(mut reader: impl Read, mut f: impl FnMut(String)) {
    let mut buf = [0u8; 8192];
    let mut pending: Vec<u8> = Vec::new();
    let flush = |bytes: &mut Vec<u8>, f: &mut dyn FnMut(String)| {
        if !bytes.is_empty() {
            let text = String::from_utf8_lossy(bytes);
            let line = strip_ansi(text.trim_start_matches('\u{feff}'));
            let line = line.trim_end();
            if !line.trim().is_empty() {
                f(line.to_string());
            }
            bytes.clear();
        }
    };
    loop {
        match reader.read(&mut buf) {
            Ok(0) | Err(_) => break,
            Ok(n) => {
                for &b in &buf[..n] {
                    if b == b'\r' || b == b'\n' {
                        flush(&mut pending, &mut f);
                    } else {
                        pending.push(b);
                    }
                }
            }
        }
    }
    flush(&mut pending, &mut f);
}

// ---------------------------------------------------------------------------
// Which programs the UI may run

/// Only DataTool/TankView executables the app located or installed can be
/// started from the webview.
#[derive(Default)]
pub struct AllowedPrograms(Mutex<HashSet<PathBuf>>);

impl AllowedPrograms {
    pub fn allow(&self, path: PathBuf) {
        self.0.lock().unwrap().insert(path);
    }

    fn check(&self, program: &str) -> Result<(), String> {
        if self.0.lock().unwrap().contains(&PathBuf::from(program)) {
            Ok(())
        } else {
            Err(format!("Refusing to run {program}: not a DataTool executable this app located"))
        }
    }
}

// ---------------------------------------------------------------------------
// Short commands

#[derive(Debug, Serialize)]
pub struct CaptureResult {
    pub code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}

fn clean(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes)
        .trim_start_matches('\u{feff}')
        .split(['\r', '\n'])
        .map(strip_ansi)
        .filter(|l| !l.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

#[tauri::command]
pub async fn run_capture(
    allowed: tauri::State<'_, AllowedPrograms>,
    program: String,
    args: Vec<String>,
    cwd: Option<String>,
) -> Result<CaptureResult, String> {
    allowed.check(&program)?;
    tauri::async_runtime::spawn_blocking(move || {
        let output = build_command(&program, &args, cwd.as_deref())
            .output()
            .map_err(|e| format!("Could not start {program}: {e}"))?;
        Ok(CaptureResult {
            code: output.status.code(),
            stdout: clean(&output.stdout),
            stderr: clean(&output.stderr),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Start a program without waiting for it or capturing output (TankView).
#[tauri::command]
pub fn launch(allowed: tauri::State<'_, AllowedPrograms>, program: String, args: Vec<String>) -> Result<(), String> {
    allowed.check(&program)?;
    let mut cmd = Command::new(&program);
    cmd.args(args);
    if let Some(dir) = Path::new(&program).parent() {
        cmd.current_dir(dir);
    }
    cmd.spawn().map(|_| ()).map_err(|e| format!("Could not start {program}: {e}"))
}

// ---------------------------------------------------------------------------
// Jobs

#[derive(Default)]
pub struct Jobs {
    running: Mutex<HashMap<String, RunningJob>>,
}

struct RunningJob {
    pid: u32,
    cancelled: Arc<AtomicBool>,
}

impl Jobs {
    pub fn kill_all(&self) {
        let running = self.running.lock().unwrap();
        for job in running.values() {
            job.cancelled.store(true, Ordering::SeqCst);
            kill_tree(job.pid);
        }
    }
}

#[derive(Clone, Serialize)]
struct OutputLine {
    stream: &'static str,
    line: String,
}

#[derive(Clone, Serialize)]
struct OutputEvent<'a> {
    id: &'a str,
    lines: Vec<OutputLine>,
}

#[derive(Clone, Serialize)]
struct FilesEvent<'a> {
    id: &'a str,
    files: u64,
    bytes: u64,
}

#[derive(Clone, Serialize)]
struct ExitEvent {
    id: String,
    code: Option<i32>,
    cancelled: bool,
    error: Option<String>,
}

/// Count files (and their size) under `dir` modified at or after `since`.
pub fn count_new_files(dir: &Path, since: SystemTime) -> (u64, u64) {
    let mut files = 0;
    let mut bytes = 0;
    let mut stack = vec![dir.to_path_buf()];
    while let Some(d) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&d) else { continue };
        for e in entries.flatten() {
            let Ok(meta) = e.metadata() else { continue };
            if meta.is_dir() {
                stack.push(e.path());
            } else if meta.modified().map(|m| m >= since).unwrap_or(false) {
                files += 1;
                bytes += meta.len();
            }
        }
    }
    (files, bytes)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)] // Tauri injects state + IPC args
pub fn start_job(
    app: AppHandle,
    jobs: tauri::State<'_, Jobs>,
    allowed: tauri::State<'_, AllowedPrograms>,
    id: String,
    program: String,
    args: Vec<String>,
    cwd: Option<String>,
    watch_dir: Option<String>,
    stdout_file: Option<String>,
) -> Result<u32, String> {
    allowed.check(&program)?;
    // Before spawning: failing after it would leave DataTool running unseen.
    let mut tee = match stdout_file.as_deref().filter(|s| !s.is_empty()) {
        Some(path) => {
            if let Some(parent) = Path::new(path).parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let file = std::fs::File::create(path).map_err(|e| format!("Could not create {path}: {e}"))?;
            // List modes can print hundreds of thousands of lines.
            Some(BufWriter::new(file))
        }
        None => None,
    };

    // File timestamps can be coarser than the clock; start a little early so
    // files written in the first instant still count.
    let started = SystemTime::now() - Duration::from_secs(2);
    let mut child: Child = build_command(&program, &args, cwd.as_deref())
        .spawn()
        .map_err(|e| format!("Could not start {program}: {e}"))?;
    let pid = child.id();
    let cancelled = Arc::new(AtomicBool::new(false));
    let finished = Arc::new(AtomicBool::new(false));
    jobs.running
        .lock()
        .unwrap()
        .insert(id.clone(), RunningJob { pid, cancelled: cancelled.clone() });

    // Readers send lines to one emitter, which batches them: some modes print
    // tens of thousands of lines and one event per line would swamp the UI.
    let (tx, rx) = mpsc::channel::<OutputLine>();
    let readers: Vec<_> = [
        child.stdout.take().map(|s| (Box::new(s) as Box<dyn Read + Send>, "stdout")),
        child.stderr.take().map(|s| (Box::new(s) as Box<dyn Read + Send>, "stderr")),
    ]
    .into_iter()
    .flatten()
    .map(|(stream, name)| {
        let tx = tx.clone();
        let mut tee = if name == "stdout" { tee.take() } else { None };
        std::thread::spawn(move || {
            for_each_line(stream, |line| {
                if let Some(f) = tee.as_mut() {
                    let _ = writeln!(f, "{line}");
                }
                let _ = tx.send(OutputLine { stream: name, line });
            });
            // Complete on disk before the exit event lets the UI read it.
            if let Some(f) = tee.as_mut() {
                let _ = f.flush();
            }
        })
    })
    .collect();
    drop(tx);

    let emitter = {
        let (app, id) = (app.clone(), id.clone());
        std::thread::spawn(move || {
            let mut batch: Vec<OutputLine> = Vec::new();
            let mut last = Instant::now();
            loop {
                let msg = rx.recv_timeout(Duration::from_millis(80));
                let disconnected = matches!(msg, Err(mpsc::RecvTimeoutError::Disconnected));
                if let Ok(line) = msg {
                    batch.push(line);
                }
                if !batch.is_empty() && (disconnected || batch.len() >= 400 || last.elapsed() >= Duration::from_millis(80)) {
                    let _ = app.emit("job-output", OutputEvent { id: &id, lines: std::mem::take(&mut batch) });
                    last = Instant::now();
                }
                if disconnected {
                    break;
                }
            }
        })
    };

    let watch_dir = watch_dir.filter(|d| !d.is_empty()).map(PathBuf::from);
    if let Some(dir) = watch_dir.clone() {
        let (app, id, finished) = (app.clone(), id.clone(), finished.clone());
        std::thread::spawn(move || {
            let mut last = (u64::MAX, 0);
            while !finished.load(Ordering::SeqCst) {
                let t = Instant::now();
                let now = count_new_files(&dir, started);
                if now != last {
                    let _ = app.emit("job-files", FilesEvent { id: &id, files: now.0, bytes: now.1 });
                    last = now;
                }
                // Walking a big output tree isn't free; back off accordingly.
                let wait = Duration::from_millis(1000).max(t.elapsed() * 4);
                let until = Instant::now() + wait;
                while Instant::now() < until && !finished.load(Ordering::SeqCst) {
                    std::thread::sleep(Duration::from_millis(100));
                }
            }
        });
    }

    std::thread::spawn(move || {
        let status = child.wait();
        // Drain remaining output before reporting the exit.
        for t in readers {
            let _ = t.join();
        }
        let _ = emitter.join();
        finished.store(true, Ordering::SeqCst);
        // Final count before the exit event, so the UI reports the full total.
        if let Some(dir) = &watch_dir {
            let (files, bytes) = count_new_files(dir, started);
            let _ = app.emit("job-files", FilesEvent { id: &id, files, bytes });
        }
        app.state::<Jobs>().running.lock().unwrap().remove(&id);
        let (code, error) = match status {
            Ok(s) => (s.code(), None),
            Err(e) => (None, Some(e.to_string())),
        };
        let _ = app.emit("job-exit", ExitEvent { id, code, cancelled: cancelled.load(Ordering::SeqCst), error });
    });

    Ok(pid)
}

#[tauri::command]
pub async fn stop_job(jobs: tauri::State<'_, Jobs>, id: String) -> Result<bool, String> {
    let pid = {
        let running = jobs.running.lock().unwrap();
        let Some(job) = running.get(&id) else {
            return Ok(false);
        };
        job.cancelled.store(true, Ordering::SeqCst);
        job.pid
    };
    tauri::async_runtime::spawn_blocking(move || kill_tree(pid))
        .await
        .map_err(|e| e.to_string())
}

fn kill_tree(pid: u32) -> bool {
    #[cfg(windows)]
    let mut cmd = {
        let mut c = Command::new("taskkill");
        c.args(["/PID", &pid.to_string(), "/T", "/F"]);
        c
    };
    #[cfg(not(windows))]
    let mut cmd = {
        let mut c = Command::new("kill");
        c.args(["-9", &pid.to_string()]);
        c
    };
    hide_window(&mut cmd);
    cmd.stdout(Stdio::null()).stderr(Stdio::null());
    cmd.status().map(|s| s.success()).unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_colors_and_links() {
        let raw = "\u{1b}[38;2;255;69;0m[CASC] Error\u{1b}[0m \u{1b}]8;;https://x.y\u{1b}\\link\u{1b}]8;;\u{1b}\\";
        assert_eq!(strip_ansi(raw), "[CASC] Error link");
    }

    #[test]
    fn splits_lines_and_keeps_tabs() {
        let input = "\u{feff}[Core] Tooling...\r\nProcessing unlocks for Tracer\n\tExtracting skin X\n\n\t\tDone\r\n".as_bytes();
        let mut lines = vec![];
        for_each_line(input, |l| lines.push(l));
        assert_eq!(lines, vec!["[Core] Tooling...", "Processing unlocks for Tracer", "\tExtracting skin X", "\t\tDone"]);
    }

    #[test]
    fn counts_new_files() {
        let dir = std::env::temp_dir().join(format!("dtg-count-{}", std::process::id()));
        std::fs::create_dir_all(dir.join("a/b")).unwrap();
        std::fs::write(dir.join("a/one.png"), b"12345").unwrap();
        std::fs::write(dir.join("a/b/two.ogg"), b"123").unwrap();
        let since = SystemTime::now() - Duration::from_secs(60);
        assert_eq!(count_new_files(&dir, since), (2, 8));
        let future = SystemTime::now() + Duration::from_secs(3600);
        assert_eq!(count_new_files(&dir, future), (0, 0));
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
