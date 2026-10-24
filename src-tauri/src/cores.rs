//! DataTool "cores": the DataTool builds the app runs.
//!
//! Each GitHub release (`toolchain-release.zip`) is unpacked into its own
//! folder under `datatool/`, so older builds stay available for older game
//! versions and an update can be rolled back. A user's own DataTool folder
//! can be used too.

use std::collections::HashMap;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::paths::{AppPaths, exe_name, is_inside};
use crate::process::AllowedPrograms;

const USER_AGENT: &str = concat!("DataToolGUI/", env!("CARGO_PKG_VERSION"));
/// Written into each installed core with the release it came from.
const MANIFEST: &str = ".datatoolgui.json";

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .connect_timeout(Duration::from_secs(20))
        // Error out on a stalled connection instead of hanging forever.
        .read_timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Releases

#[derive(Debug, Serialize, Deserialize)]
pub struct ReleaseAsset {
    pub name: String,
    pub browser_download_url: String,
    pub size: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Release {
    pub tag_name: String,
    pub name: Option<String>,
    pub published_at: Option<String>,
    pub html_url: String,
    pub body: Option<String>,
    pub prerelease: bool,
    pub draft: bool,
    pub assets: Vec<ReleaseAsset>,
}

/// Recent releases of a GitHub repo (newest first).
#[tauri::command]
pub async fn list_releases(repo: String, count: Option<u32>) -> Result<Vec<Release>, String> {
    let url = format!("https://api.github.com/repos/{repo}/releases?per_page={}", count.unwrap_or(30).min(100));
    let resp = client()?
        .get(url)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("Could not reach GitHub: {e}"))?;
    let status = resp.status();
    if status == reqwest::StatusCode::FORBIDDEN || status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Err("GitHub's rate limit for update checks was reached. Try again in an hour.".into());
    }
    if !status.is_success() {
        return Err(format!("GitHub returned {status}"));
    }
    let releases = resp.json::<Vec<Release>>().await.map_err(|e| e.to_string())?;
    Ok(releases.into_iter().filter(|r| !r.draft).collect())
}

// ---------------------------------------------------------------------------
// Downloads

#[derive(Default)]
pub struct Downloads {
    active: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

#[derive(Clone, Serialize)]
struct DownloadProgress<'a> {
    id: &'a str,
    received: u64,
    total: Option<u64>,
}

/// Download `url` to `dest`, writing to `dest.part` first so a failed or
/// cancelled download never leaves a broken file behind.
#[tauri::command]
pub async fn download_file(
    app: AppHandle,
    downloads: tauri::State<'_, Downloads>,
    id: String,
    url: String,
    dest: String,
) -> Result<(), String> {
    let cancel = Arc::new(AtomicBool::new(false));
    downloads.active.lock().unwrap().insert(id.clone(), cancel.clone());
    // Retry transient failures (dropped connections, CDN hiccups).
    let mut result = Err(String::new());
    for attempt in 1..=3u64 {
        result = download_inner(&app, &id, &url, PathBuf::from(&dest), &cancel).await;
        if result.is_ok() || cancel.load(Ordering::SeqCst) {
            break;
        }
        if attempt < 3 {
            let wait = Duration::from_secs(2 * attempt);
            let _ = tauri::async_runtime::spawn_blocking(move || std::thread::sleep(wait)).await;
        }
    }
    downloads.active.lock().unwrap().remove(&id);
    result
}

async fn download_inner(app: &AppHandle, id: &str, url: &str, dest: PathBuf, cancel: &AtomicBool) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let resp = client()?.get(url).send().await.map_err(|e| format!("Download failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Download failed: server returned {}", resp.status()));
    }
    let total = resp.content_length();
    let part = dest.with_extension(match dest.extension() {
        Some(ext) => format!("{}.part", ext.to_string_lossy()),
        None => "part".into(),
    });
    let mut file = std::fs::File::create(&part).map_err(|e| e.to_string())?;
    let mut received = 0u64;
    let mut last_emit = Instant::now() - Duration::from_secs(1);
    let mut stream = resp.bytes_stream();

    let outcome: Result<(), String> = async {
        while let Some(chunk) = stream.next().await {
            if cancel.load(Ordering::SeqCst) {
                return Err("Download cancelled".into());
            }
            let chunk = chunk.map_err(|e| format!("Download interrupted: {e}"))?;
            file.write_all(&chunk).map_err(|e| e.to_string())?;
            received += chunk.len() as u64;
            if last_emit.elapsed() >= Duration::from_millis(150) {
                last_emit = Instant::now();
                let _ = app.emit("download-progress", DownloadProgress { id, received, total });
            }
        }
        Ok(())
    }
    .await;

    drop(file);
    if let Err(e) = outcome {
        let _ = std::fs::remove_file(&part);
        return Err(e);
    }
    if let Some(total) = total.filter(|&t| t != received) {
        let _ = std::fs::remove_file(&part);
        return Err(format!("Download incomplete ({received} of {total} bytes)"));
    }
    let _ = app.emit("download-progress", DownloadProgress { id, received, total: Some(received) });
    if dest.exists() {
        std::fs::remove_file(&dest).map_err(|e| format!("Could not replace {}: {e}", dest.display()))?;
    }
    std::fs::rename(&part, &dest).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cancel_download(downloads: tauri::State<'_, Downloads>, id: String) {
    if let Some(flag) = downloads.active.lock().unwrap().get(&id) {
        flag.store(true, Ordering::SeqCst);
    }
}

// ---------------------------------------------------------------------------
// Installed cores

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoreInfo {
    /// Folder name under `datatool/`, or empty for a custom folder.
    pub name: String,
    pub dir: PathBuf,
    pub exe: PathBuf,
    pub tankview: Option<PathBuf>,
    /// The release this core was installed from (tag, notes...), if known.
    pub manifest: Option<serde_json::Value>,
    /// DataTool loads saved arguments from this file into every run.
    pub args_file: Option<PathBuf>,
    pub managed: bool,
}

fn args_file(dir: &Path) -> Option<PathBuf> {
    ["DataTool.args", "DataTool.exe.args"].iter().map(|n| dir.join(n)).find(|p| p.is_file())
}

fn core_info(dir: &Path, managed: bool, allowed: &AllowedPrograms) -> Option<CoreInfo> {
    let exe = dir.join(exe_name("DataTool"));
    if !exe.is_file() {
        return None;
    }
    let tankview = Some(dir.join(exe_name("TankView"))).filter(|p| p.is_file());
    allowed.allow(exe.clone());
    if let Some(t) = &tankview {
        allowed.allow(t.clone());
    }
    let manifest = std::fs::read_to_string(dir.join(MANIFEST))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok());
    Some(CoreInfo {
        name: if managed { dir.file_name()?.to_string_lossy().into_owned() } else { String::new() },
        dir: dir.to_path_buf(),
        exe,
        tankview,
        manifest,
        args_file: args_file(dir),
        managed,
    })
}

#[tauri::command(async)]
pub fn list_cores(paths: tauri::State<'_, AppPaths>, allowed: tauri::State<'_, AllowedPrograms>) -> Vec<CoreInfo> {
    let Ok(entries) = std::fs::read_dir(&paths.cores) else {
        return vec![];
    };
    let mut cores: Vec<CoreInfo> = entries
        .flatten()
        .filter(|e| e.path().is_dir() && !e.file_name().to_string_lossy().starts_with('.'))
        .filter_map(|e| core_info(&e.path(), true, &allowed))
        .collect();
    cores.sort_by(|a, b| b.name.cmp(&a.name));
    cores
}

/// Use a DataTool folder (or DataTool.exe) the user already has.
#[tauri::command(async)]
pub fn open_core(path: String, allowed: tauri::State<'_, AllowedPrograms>) -> Result<CoreInfo, String> {
    let p = PathBuf::from(&path);
    let dir = if p.is_file() { p.parent().map(Path::to_path_buf).unwrap_or(p) } else { p };
    core_info(&dir, false, &allowed).ok_or_else(|| format!("No {} in {}", exe_name("DataTool"), dir.display()))
}

/// Unpack a DataTool zip into `datatool/<name>` and record where it came from.
#[tauri::command]
pub async fn install_core(
    paths: tauri::State<'_, AppPaths>,
    allowed: tauri::State<'_, AllowedPrograms>,
    zip: String,
    name: String,
    manifest: serde_json::Value,
) -> Result<CoreInfo, String> {
    let cores = paths.cores.clone();
    let safe: String = name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || "._-+".contains(c) { c } else { '_' })
        .collect();
    if safe.is_empty() || safe.starts_with('.') {
        return Err("Invalid version name".into());
    }
    let dest = cores.join(&safe);
    let dir = tauri::async_runtime::spawn_blocking(move || -> Result<PathBuf, String> {
        let staging = cores.join(format!(".installing-{safe}"));
        let _ = std::fs::remove_dir_all(&staging);
        extract_zip(Path::new(&zip), &staging)?;
        // The DataTool folder may be the zip root or a folder inside it.
        let root = find_datatool(&staging, 3).ok_or_else(|| {
            let _ = std::fs::remove_dir_all(&staging);
            format!("This zip doesn't contain {}", exe_name("DataTool"))
        })?;
        std::fs::write(root.join(MANIFEST), serde_json::to_vec_pretty(&manifest).unwrap_or_default())
            .map_err(|e| e.to_string())?;
        if dest.exists() {
            std::fs::remove_dir_all(&dest).map_err(|e| format!("Could not replace {}: {e}. Is it running?", dest.display()))?;
        }
        std::fs::rename(&root, &dest).map_err(|e| e.to_string())?;
        let _ = std::fs::remove_dir_all(&staging);
        Ok(dest)
    })
    .await
    .map_err(|e| e.to_string())??;
    core_info(&dir, true, &allowed).ok_or_else(|| "Installed, but DataTool.exe is missing".into())
}

fn find_datatool(dir: &Path, depth: u32) -> Option<PathBuf> {
    if dir.join(exe_name("DataTool")).is_file() {
        return Some(dir.to_path_buf());
    }
    if depth == 0 {
        return None;
    }
    std::fs::read_dir(dir)
        .ok()?
        .flatten()
        .filter(|e| e.path().is_dir())
        .find_map(|e| find_datatool(&e.path(), depth - 1))
}

fn extract_zip(zip: &Path, dest: &Path) -> Result<(), String> {
    let file = std::fs::File::open(zip).map_err(|e| format!("Could not open {}: {e}", zip.display()))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Not a valid zip file: {e}"))?;
    std::fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        // enclosed_name rejects absolute paths and `..` (zip slip).
        let Some(rel) = entry.enclosed_name() else { continue };
        let out = dest.join(rel);
        if entry.is_dir() {
            std::fs::create_dir_all(&out).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(parent) = out.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut f = std::fs::File::create(&out).map_err(|e| format!("Could not write {}: {e}", out.display()))?;
        std::io::copy(&mut entry, &mut f).map_err(|e| format!("Could not extract {}: {e}", out.display()))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn remove_core(paths: tauri::State<'_, AppPaths>, name: String) -> Result<(), String> {
    let dir = paths.cores.join(&name);
    if name.is_empty() || !is_inside(&dir, &paths.cores) {
        return Err("Only DataTool versions installed by this app can be removed".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        std::fs::remove_dir_all(&dir).map_err(|e| format!("Could not remove {}: {e}. Is it running?", dir.display()))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Delete DataTool's saved-arguments file, which it otherwise adds to every run.
#[tauri::command(async)]
pub fn delete_args_file(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    let name = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    if !(name.eq_ignore_ascii_case("DataTool.args") || name.eq_ignore_ascii_case("DataTool.exe.args")) {
        return Err("Not a DataTool arguments file".into());
    }
    std::fs::remove_file(&p).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_nested_zip_and_finds_datatool() {
        let base = std::env::temp_dir().join(format!("dtg-zip-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).unwrap();
        let zip_path = base.join("t.zip");
        {
            let f = std::fs::File::create(&zip_path).unwrap();
            let mut w = zip::ZipWriter::new(f);
            let o = zip::write::SimpleFileOptions::default();
            w.start_file("release/DataTool.exe", o).unwrap();
            w.write_all(b"MZ").unwrap();
            w.start_file("release/Static/GUIDNames.csv", o).unwrap();
            w.write_all(b"a,b").unwrap();
            w.start_file("../evil.txt", o).unwrap();
            w.write_all(b"x").unwrap();
            w.finish().unwrap();
        }
        let out = base.join("out");
        extract_zip(&zip_path, &out).unwrap();
        assert!(!base.join("evil.txt").exists());
        let found = find_datatool(&out, 3).unwrap();
        assert!(found.ends_with("release"));
        assert!(found.join("Static/GUIDNames.csv").is_file());
        std::fs::remove_dir_all(&base).unwrap();
    }
}
