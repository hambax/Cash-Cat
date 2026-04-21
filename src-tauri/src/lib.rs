use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

struct EngineState {
    child: Mutex<Option<Child>>,
    port: u16,
}

impl Drop for EngineState {
    fn drop(&mut self) {
        if let Ok(mut g) = self.child.lock() {
            if let Some(mut c) = g.take() {
                let _ = c.kill();
                let _ = c.wait();
            }
        }
    }
}

fn project_engine_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("manifest")
        .join("engine")
}

/// Bundled `engine/` from Tauri `bundle.resources`, or the repo `engine/` folder during `tauri dev` / `cargo run`.
fn resolve_engine_dir(app: &AppHandle) -> PathBuf {
    if let Ok(resource) = app.path().resource_dir() {
        let bundled = resource.join("engine");
        if bundled.join("cash_cat").join("app.py").exists() {
            return bundled;
        }
    }
    project_engine_dir()
}

fn sidecar_filename() -> Option<&'static str> {
    if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        Some("cash-cat-engine-aarch64-apple-darwin")
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        Some("cash-cat-engine-x86_64-apple-darwin")
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        Some("cash-cat-engine-x86_64-unknown-linux-gnu")
    } else if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        Some("cash-cat-engine-x86_64-pc-windows-msvc.exe")
    } else {
        None
    }
}

fn spawn_engine(app: &AppHandle, port: u16) -> Result<Child, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    let db_path = app_dir.join("cash_cat.db");
    let db_path_str = db_path.to_string_lossy().into_owned();

    if let Some(name) = sidecar_filename() {
        if let Some(exe_dir) = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(Path::to_path_buf))
        {
            let sidecar = exe_dir.join(name);
            if sidecar.exists() {
                return Command::new(&sidecar)
                    .env("CASH_CAT_DB_PATH", &db_path_str)
                    .args(["--host", "127.0.0.1", "--port", &port.to_string()])
                    .spawn()
                    .map_err(|e| {
                        format!(
                            "failed to spawn engine sidecar {}: {e}",
                            sidecar.display()
                        )
                    });
            }
        }
    }

    let engine_dir = resolve_engine_dir(app);
    if !engine_dir.join("cash_cat").join("app.py").exists() {
        return Err(format!(
            "Engine not found at {}. For release builds, run the packaging scripts so bundled-engine and the sidecar exist.",
            engine_dir.display()
        ));
    }

    let py = if cfg!(windows) { "python" } else { "python3" };
    let engine_dir_str = engine_dir.to_string_lossy().into_owned();

    Command::new(py)
        .current_dir(&engine_dir)
        .env("CASH_CAT_DB_PATH", &db_path_str)
        .env("PYTHONNOUSERSITE", "1")
        .env("PYTHONPATH", &engine_dir_str)
        .args([
            "-m",
            "uvicorn",
            "cash_cat.app:app",
            "--host",
            "127.0.0.1",
            "--port",
            &port.to_string(),
        ])
        .spawn()
        .map_err(|e| format!("failed to spawn engine ({py}): {e}"))
}

fn pick_free_port() -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
    listener.local_addr().expect("addr").port()
}

#[tauri::command]
fn engine_base_url(state: State<'_, EngineState>) -> String {
    format!("http://127.0.0.1:{}", state.port)
}

#[tauri::command]
fn app_data_dir_path(app: AppHandle) -> Result<String, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let port = pick_free_port();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            let handle = app.handle().clone();
            let child = spawn_engine(&handle, port)?;
            app.manage(EngineState {
                child: Mutex::new(Some(child)),
                port,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![engine_base_url, app_data_dir_path])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
