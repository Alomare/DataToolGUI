mod cores;
mod detect;
mod fs;
mod paths;
mod process;

use serde::Serialize;
use tauri::{Manager, RunEvent};

use paths::AppPaths;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    version: &'static str,
    os: &'static str,
    arch: &'static str,
    paths: AppPaths,
}

#[tauri::command]
fn app_info(paths: tauri::State<'_, AppPaths>) -> AppInfo {
    AppInfo {
        version: env!("CARGO_PKG_VERSION"),
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
        paths: paths.inner().clone(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(process::Jobs::default())
        .manage(process::AllowedPrograms::default())
        .manage(cores::Downloads::default())
        .setup(|app| {
            let paths = AppPaths::resolve(app.handle());
            app.manage(paths);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            fs::read_text,
            fs::write_text,
            fs::copy_file,
            fs::remove_file,
            fs::path_exists,
            fs::make_dir,
            fs::list_dir,
            fs::prune_dir,
            process::run_capture,
            process::start_job,
            process::stop_job,
            process::launch,
            cores::list_releases,
            cores::download_file,
            cores::cancel_download,
            cores::list_cores,
            cores::open_core,
            cores::install_core,
            cores::remove_core,
            cores::delete_args_file,
            detect::detect_installs,
            detect::check_install,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            // Don't leave extractions running in the background after closing.
            handle.state::<process::Jobs>().kill_all();
        }
    });
}
