//! Where the app keeps DataTool and its own data.
//!
//! Portable by default: everything lives next to the executable
//! (`datatool/`, `data/`). If that folder isn't writable (e.g. the app was
//! copied into Program Files) we fall back to the per-user app data dir.

use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppPaths {
    pub root: PathBuf,
    pub exe_dir: PathBuf,
    /// Installed DataTool versions, one folder each.
    pub cores: PathBuf,
    /// Settings and presets.
    pub data: PathBuf,
    /// Tool info, dynamic choices, downloads in progress.
    pub cache: PathBuf,
    /// JSON output of list modes viewed in the app.
    pub results: PathBuf,
    pub portable: bool,
}

impl AppPaths {
    pub fn resolve(app: &AppHandle) -> Self {
        let exe_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(Path::to_path_buf))
            .unwrap_or_else(|| PathBuf::from("."));

        let (root, portable) = if let Some(home) = home_override() {
            (home, true)
        } else if is_writable(&exe_dir) {
            (exe_dir.clone(), true)
        } else {
            let fallback = app.path().app_data_dir().unwrap_or_else(|_| exe_dir.clone());
            (fallback, false)
        };

        let data = root.join("data");
        let paths = Self {
            cores: root.join("datatool"),
            cache: data.join("cache"),
            results: data.join("results"),
            data,
            exe_dir,
            root,
            portable,
        };
        for dir in [&paths.cores, &paths.data, &paths.cache, &paths.results] {
            let _ = std::fs::create_dir_all(dir);
        }
        paths
    }
}

/// `DATATOOLGUI_HOME` replaces the folder next to the exe (used by the
/// end-to-end tests, and handy for keeping several setups side by side).
pub fn home_override() -> Option<PathBuf> {
    std::env::var_os("DATATOOLGUI_HOME").filter(|v| !v.is_empty()).map(PathBuf::from)
}

fn is_writable(dir: &Path) -> bool {
    let probe = dir.join(".write-test");
    match std::fs::write(&probe, b"") {
        Ok(()) => {
            let _ = std::fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

pub fn exe_name(name: &str) -> String {
    if cfg!(windows) { format!("{name}.exe") } else { name.to_string() }
}

/// Is `path` inside `dir` (after resolving `..` and symlinks)?
pub fn is_inside(path: &Path, dir: &Path) -> bool {
    match (path.canonicalize(), dir.canonicalize()) {
        (Ok(p), Ok(d)) => p.starts_with(&d) && p != d,
        _ => false,
    }
}
