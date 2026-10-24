//! Small filesystem helpers for settings, cached tool info, list results and
//! the output browser.

//!
//! Commands that touch the disk are `async` so Tauri runs them off the main
//! thread: a big folder or result file must not freeze the window.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::UNIX_EPOCH;

use serde::Serialize;

#[tauri::command(async)]
pub fn read_text(path: String) -> Result<Option<String>, String> {
    match std::fs::read(&path) {
        Ok(bytes) => {
            let s = String::from_utf8_lossy(&bytes);
            Ok(Some(s.trim_start_matches('\u{feff}').to_string()))
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Could not read {path}: {e}")),
    }
}

#[tauri::command(async)]
pub fn write_text(path: String, contents: String) -> Result<(), String> {
    let p = Path::new(&path);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    // Write-then-rename so a crash never leaves a half-written file. The temp
    // name is unique: writes run concurrently, and `a.json`/`a.txt` would
    // otherwise share `a.tmp`.
    static NEXT: AtomicU64 = AtomicU64::new(0);
    let mut tmp = p.as_os_str().to_owned();
    tmp.push(format!(".{}-{}.tmp", std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed)));
    let tmp = PathBuf::from(tmp);
    let result = std::fs::write(&tmp, contents).and_then(|()| std::fs::rename(&tmp, p));
    if result.is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
    result.map_err(|e| format!("Could not write {path}: {e}"))
}

#[tauri::command(async)]
pub fn copy_file(from: String, to: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&to).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::copy(&from, &to).map(|_| ()).map_err(|e| format!("Could not copy to {to}: {e}"))
}

#[tauri::command(async)]
pub fn remove_file(path: String) -> Result<(), String> {
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("Could not delete {path}: {e}")),
    }
}

#[tauri::command(async)]
pub fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[tauri::command(async)]
pub fn make_dir(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|e| format!("Could not create {path}: {e}"))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    name: String,
    path: PathBuf,
    is_dir: bool,
    size: u64,
    /// Milliseconds since the Unix epoch.
    modified: u64,
}

/// One level of a folder, folders first, then by name.
#[tauri::command(async)]
pub fn list_dir(path: String) -> Result<Vec<DirEntry>, String> {
    let entries = std::fs::read_dir(&path).map_err(|e| format!("Could not open {path}: {e}"))?;
    let mut out: Vec<DirEntry> = entries
        .flatten()
        .filter_map(|e| {
            let meta = e.metadata().ok()?;
            Some(DirEntry {
                name: e.file_name().to_string_lossy().into_owned(),
                path: e.path(),
                is_dir: meta.is_dir(),
                size: if meta.is_dir() { 0 } else { meta.len() },
                modified: meta
                    .modified()
                    .ok()
                    .and_then(|m| m.duration_since(UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0),
            })
        })
        .collect();
    out.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then_with(|| natural_key(&a.name).cmp(&natural_key(&b.name))));
    Ok(out)
}

/// Lowercase name with digit runs zero-padded, so "Skin 10" sorts after "Skin 9".
fn natural_key(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 8);
    let mut digits = String::new();
    for c in s.chars().chain(std::iter::once('\0')) {
        if c.is_ascii_digit() {
            digits.push(c);
            continue;
        }
        if !digits.is_empty() {
            out.push_str(&format!("{:0>12}", digits));
            digits.clear();
        }
        if c != '\0' {
            out.extend(c.to_lowercase());
        }
    }
    out
}

/// Delete the oldest files in `dir` beyond the newest `keep`.
#[tauri::command(async)]
pub fn prune_dir(path: String, keep: usize) -> Result<usize, String> {
    let Ok(entries) = std::fs::read_dir(&path) else { return Ok(0) };
    let mut files: Vec<(std::time::SystemTime, PathBuf)> = entries
        .flatten()
        .filter_map(|e| {
            let m = e.metadata().ok()?;
            m.is_file().then(|| (m.modified().unwrap_or(UNIX_EPOCH), e.path()))
        })
        .collect();
    files.sort_by_key(|f| std::cmp::Reverse(f.0));
    let mut removed = 0;
    for (_, p) in files.into_iter().skip(keep) {
        if std::fs::remove_file(p).is_ok() {
            removed += 1;
        }
    }
    Ok(removed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_text_replaces_atomically() {
        let dir = std::env::temp_dir().join(format!("dtg-write-{}", std::process::id()));
        let file = dir.join("settings.json");
        let path = file.to_string_lossy().to_string();
        // Concurrent writers of the same file all succeed; the last one wins.
        let handles: Vec<_> = (0..8)
            .map(|i| {
                let path = path.clone();
                std::thread::spawn(move || write_text(path, format!("{{\"n\":{i}}}")))
            })
            .collect();
        for h in handles {
            h.join().unwrap().unwrap();
        }
        assert!(std::fs::read_to_string(&file).unwrap().starts_with("{\"n\":"));
        // No temp files left behind.
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 1);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn natural_sort() {
        let mut v = vec!["Skin 10", "skin 9", "Skin 1", "A"];
        v.sort_by_key(|s| natural_key(s));
        assert_eq!(v, vec!["A", "Skin 1", "skin 9", "Skin 10"]);
    }
}
