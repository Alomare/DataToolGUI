//! Finding Overwatch installs (Battle.net and Steam) and reading their build.

use std::path::{Path, PathBuf};

use serde::Serialize;

const STEAM_APP_ID: &str = "2357570";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameInstall {
    pub path: PathBuf,
    /// "steam", "battlenet" or "unknown".
    pub launcher: &'static str,
    /// Where we found it ("Steam library", "Battle.net", "Registry", ...).
    pub source: String,
    /// Game version from `.build.info` (Battle.net only), e.g. 2.25.0.0.154088.
    pub version: Option<String>,
    /// Battle.net product code: "pro" (live) or "prot" (PTR)...
    pub product: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallCheck {
    pub exists: bool,
    pub looks_valid: bool,
    pub install: Option<GameInstall>,
    pub message: Option<String>,
}

/// Parse Battle.net's `.build.info`: a `|`-separated table whose header row
/// looks like `Branch!STRING:0|Active!DEC:1|...|Version!STRING:0|Product!STRING:0`.
pub fn parse_build_info(text: &str) -> Option<(String, Option<String>)> {
    let mut lines = text.lines().filter(|l| !l.trim().is_empty() && !l.starts_with('#'));
    let header: Vec<String> = lines.next()?.split('|').map(|h| h.split('!').next().unwrap_or("").to_string()).collect();
    let col = |name: &str| header.iter().position(|h| h.eq_ignore_ascii_case(name));
    let (vi, pi, ai) = (col("Version")?, col("Product"), col("Active"));
    let rows: Vec<Vec<&str>> = lines.map(|l| l.split('|').collect()).collect();
    let row = rows
        .iter()
        .find(|r| ai.and_then(|i| r.get(i)).is_some_and(|a| *a == "1"))
        .or(rows.first())?;
    let version = row.get(vi)?.trim().to_string();
    let product = pi.and_then(|i| row.get(i)).map(|p| p.trim().to_string()).filter(|p| !p.is_empty());
    (!version.is_empty()).then_some((version, product))
}

fn inspect(path: &Path, source: &str) -> Option<GameInstall> {
    if !path.is_dir() {
        return None;
    }
    let build_info = path.join(".build.info");
    let steam = path.join("data").join("data.000.000").is_file()
        || path.parent().and_then(Path::parent).is_some_and(|p| p.join(format!("appmanifest_{STEAM_APP_ID}.acf")).is_file());
    let bnet = build_info.is_file() || path.join("data").join("casc").is_dir();
    if !steam && !bnet {
        return None;
    }
    let (version, product) = std::fs::read_to_string(&build_info)
        .ok()
        .and_then(|t| parse_build_info(&t))
        .map(|(v, p)| (Some(v), p))
        .unwrap_or((None, None));
    Some(GameInstall {
        path: path.to_path_buf(),
        launcher: if bnet { "battlenet" } else { "steam" },
        source: source.to_string(),
        version,
        product,
    })
}

/// Validate a folder picked by the user, with a hint when it's close but wrong
/// (e.g. the `_retail_` subfolder or the `data` folder).
#[tauri::command(async)]
pub fn check_install(path: String) -> InstallCheck {
    let p = PathBuf::from(path.trim().trim_end_matches(['\\', '/']));
    if !p.is_dir() {
        return InstallCheck { exists: false, looks_valid: false, install: None, message: Some("This folder doesn't exist".into()) };
    }
    if let Some(install) = inspect(&p, "Chosen folder") {
        return InstallCheck { exists: true, looks_valid: true, install: Some(install), message: None };
    }
    let name = p.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
    if let Some(parent) = p.parent().filter(|_| ["_retail_", "_ptr_", "data", "casc"].contains(&name.as_str()))
        && let Some(parent_install) = inspect(parent, "Chosen folder").or_else(|| parent.parent().and_then(|pp| inspect(pp, "Chosen folder"))) {
            return InstallCheck {
                exists: true,
                looks_valid: false,
                message: Some(format!("Pick the main Overwatch folder instead: {}", parent_install.path.display())),
                install: Some(parent_install),
            };
        }
    InstallCheck {
        exists: true,
        looks_valid: false,
        install: None,
        message: Some("This doesn't look like an Overwatch folder (no game data found). Pick the folder that contains Overwatch's data folder.".into()),
    }
}

#[tauri::command]
pub async fn detect_installs() -> Vec<GameInstall> {
    tauri::async_runtime::spawn_blocking(detect).await.unwrap_or_default()
}

fn detect() -> Vec<GameInstall> {
    let mut found: Vec<GameInstall> = Vec::new();
    let mut add = |path: PathBuf, source: &str| {
        let key = path.to_string_lossy().to_lowercase().trim_end_matches(['\\', '/']).to_string();
        if found.iter().any(|f| f.path.to_string_lossy().to_lowercase().trim_end_matches(['\\', '/']) == key) {
            return;
        }
        if let Some(i) = inspect(&path, source) {
            found.push(i);
        }
    };

    // Registry entries first: their paths have the right letter case, while
    // Steam's own config often stores them lowercased.
    for (path, source) in registry_installs() {
        add(path, &source);
    }
    for lib in steam_libraries() {
        let manifest = lib.join("steamapps").join(format!("appmanifest_{STEAM_APP_ID}.acf"));
        if let Ok(text) = std::fs::read_to_string(&manifest) {
            let dir = vdf_value(&text, "installdir").unwrap_or_else(|| "Overwatch".into());
            add(lib.join("steamapps").join("common").join(dir), "Steam library");
        }
    }
    for path in battlenet_product_db() {
        add(path, "Battle.net");
    }
    for drive in ["C", "D", "E", "F"] {
        for dir in [
            r"\Program Files (x86)\Overwatch",
            r"\Program Files\Overwatch",
            r"\Games\Overwatch",
            r"\Program Files (x86)\Overwatch Test",
            r"\Program Files (x86)\Steam\steamapps\common\Overwatch",
        ] {
            add(PathBuf::from(format!("{drive}:{dir}")), "Common location");
        }
    }
    found
}

/// The first `"key"  "value"` pair in a Valve KeyValues text file.
fn vdf_value(text: &str, key: &str) -> Option<String> {
    let needle = format!("\"{key}\"");
    text.lines().find_map(|l| {
        let l = l.trim();
        let rest = l.strip_prefix(&needle)?.trim();
        Some(rest.trim_matches('"').replace("\\\\", "\\"))
    })
}

fn steam_libraries() -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = Vec::new();
    #[cfg(windows)]
    {
        use winreg::RegKey;
        use winreg::enums::*;
        for (hive, key, value) in [
            (HKEY_CURRENT_USER, r"Software\Valve\Steam", "SteamPath"),
            (HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Valve\Steam", "InstallPath"),
            (HKEY_LOCAL_MACHINE, r"SOFTWARE\Valve\Steam", "InstallPath"),
        ] {
            if let Ok(v) = RegKey::predef(hive).open_subkey(key).and_then(|k| k.get_value::<String, _>(value)) {
                roots.push(PathBuf::from(v.replace('/', "\\")));
            }
        }
        roots.push(PathBuf::from(r"C:\Program Files (x86)\Steam"));
    }
    #[cfg(not(windows))]
    if let Some(home) = std::env::var_os("HOME") {
        roots.push(PathBuf::from(&home).join(".steam/steam"));
        roots.push(PathBuf::from(&home).join(".local/share/Steam"));
    }

    let mut libs: Vec<PathBuf> = Vec::new();
    for root in roots {
        if !libs.contains(&root) && root.is_dir() {
            libs.push(root.clone());
        }
        let vdf = root.join("steamapps").join("libraryfolders.vdf");
        if let Ok(text) = std::fs::read_to_string(vdf) {
            for line in text.lines() {
                let l = line.trim();
                if let Some(rest) = l.strip_prefix("\"path\"") {
                    let p = PathBuf::from(rest.trim().trim_matches('"').replace("\\\\", "\\"));
                    if !libs.contains(&p) {
                        libs.push(p);
                    }
                }
            }
        }
    }
    libs
}

fn registry_installs() -> Vec<(PathBuf, String)> {
    #[allow(unused_mut)]
    let mut out = Vec::new();
    #[cfg(windows)]
    {
        use winreg::RegKey;
        use winreg::enums::*;
        let roots = [
            (HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
            (HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
            (HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
        ];
        for (hive, path) in roots {
            let Ok(uninstall) = RegKey::predef(hive).open_subkey(path) else { continue };
            for name in uninstall.enum_keys().flatten() {
                let Ok(k) = uninstall.open_subkey(&name) else { continue };
                let display: String = k.get_value("DisplayName").unwrap_or_default();
                if !display.to_lowercase().starts_with("overwatch") {
                    continue;
                }
                let loc: String = k.get_value("InstallLocation").unwrap_or_default();
                if !loc.trim().is_empty() {
                    out.push((PathBuf::from(loc.trim().trim_matches('"')), format!("Installed programs ({display})")));
                }
            }
        }
    }
    out
}

/// Battle.net's agent database is protobuf; pulling out path-like strings
/// that mention Overwatch is enough to find its installs.
fn battlenet_product_db() -> Vec<PathBuf> {
    let program_data = std::env::var_os("ProgramData").map(PathBuf::from).unwrap_or_else(|| PathBuf::from(r"C:\ProgramData"));
    let Ok(bytes) = std::fs::read(program_data.join("Battle.net").join("Agent").join("product.db")) else {
        return vec![];
    };
    let mut out = Vec::new();
    let mut cur = String::new();
    for &b in bytes.iter().chain(std::iter::once(&0u8)) {
        if (0x20..0x7f).contains(&b) {
            cur.push(b as char);
            continue;
        }
        let s = std::mem::take(&mut cur);
        let lower = s.to_lowercase();
        if s.len() > 4 && s.as_bytes().get(1) == Some(&b':') && lower.contains("overwatch") {
            let p = PathBuf::from(s.replace('/', "\\"));
            if !out.contains(&p) {
                out.push(p);
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_build_info() {
        let text = "Branch!STRING:0|Active!DEC:1|Build Key!HEX:16|Version!STRING:0|Product!STRING:0\n\
                    us|0|aaa|2.24.0.0.150000|pro\n\
                    eu|1|bbb|2.25.0.0.154088|pro\n";
        assert_eq!(parse_build_info(text), Some(("2.25.0.0.154088".into(), Some("pro".into()))));
    }

    #[test]
    fn reads_vdf_values() {
        let text = "\"AppState\"\n{\n\t\"appid\"\t\t\"2357570\"\n\t\"installdir\"\t\t\"Overwatch\"\n}";
        assert_eq!(vdf_value(text, "installdir").as_deref(), Some("Overwatch"));
        assert_eq!(vdf_value(text, "missing"), None);
    }
}
