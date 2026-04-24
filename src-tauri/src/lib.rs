use std::io::Write;
use std::net::{Ipv4Addr, SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use std::io::Read;
use std::sync::Mutex;
use tauri::Manager;

struct EngineStateInner {
    child: Option<Child>,
    port: u16,
    /// Incremented on each (re)start; background threads bail when this changes.
    generation: u64,
    state: String,
    error: Option<String>,
    log_path: Option<String>,
}

impl Default for EngineStateInner {
    fn default() -> Self {
        Self {
            child: None,
            port: 0,
            generation: 0,
            state: "starting".to_string(),
            error: None,
            log_path: None,
        }
    }
}

static NEXT_GENERATION: AtomicU64 = AtomicU64::new(1);

pub struct EngineState {
    inner: Arc<Mutex<EngineStateInner>>,
    app: tauri::AppHandle,
}

impl Drop for EngineState {
    fn drop(&mut self) {
        if let Ok(mut g) = self.inner.lock() {
            if let Some(mut c) = g.child.take() {
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

/// Dev-only: `engine/` from Tauri `bundle.resources` or the repo during `tauri dev`.
fn resolve_bundled_engine_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    if let Ok(resource) = app.path().resource_dir() {
        let bundled = resource.join("engine");
        if bundled.join("cash_cat").join("app.py").exists() {
            return Some(bundled);
        }
    }
    None
}

/// Tauri 2 `externalBin` can install the sidecar with the `target-triple` suffix, or as plain `cash-cat-engine[.exe]`
/// next to the main executable. Try both so packaged apps and local `target/release` match.
fn sidecar_names_to_try() -> &'static [&'static str] {
    if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        &["cash-cat-engine-aarch64-apple-darwin", "cash-cat-engine"]
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        &["cash-cat-engine-x86_64-apple-darwin", "cash-cat-engine"]
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        &["cash-cat-engine-x86_64-unknown-linux-gnu", "cash-cat-engine"]
    } else if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        &["cash-cat-engine-x86_64-pc-windows-msvc.exe", "cash-cat-engine.exe"]
    } else {
        &[]
    }
}

fn app_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

fn engine_log_name() -> String {
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("engine-{ms}.log")
}

const MAX_LOG_FILES: usize = 10;

/// Keep only the most recent `MAX_LOG_FILES` `engine-*.log` files in `logs/`.
fn rotate_engine_logs(logs_dir: &Path) -> std::io::Result<()> {
    if !logs_dir.exists() {
        return Ok(());
    }
    let mut files: Vec<(u64, PathBuf)> = std::fs::read_dir(logs_dir)?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.starts_with("engine-") && n.ends_with(".log"))
        })
        .filter_map(|p| {
            let ms = p
                .file_name()?
                .to_str()?
                .strip_prefix("engine-")?
                .strip_suffix(".log")?
                .parse::<u64>()
                .ok()?;
            Some((ms, p))
        })
        .collect();
    files.sort_by_key(|(ms, _)| *ms);
    if files.len() > MAX_LOG_FILES {
        for (_, path) in files.iter().take(files.len() - MAX_LOG_FILES) {
            let _ = std::fs::remove_file(path);
        }
    }
    Ok(())
}

fn add_stdio_to_log(
    command: &mut Command,
    log_path: &Path,
) -> Result<(), String> {
    use std::fs::OpenOptions;
    let w = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(log_path)
        .map_err(|e| format!("failed to open log file: {e}"))?;
    let w2 = w
        .try_clone()
        .map_err(|e| format!("failed to clone log file handle: {e}"))?;
    command.stdout(Stdio::from(w));
    command.stderr(Stdio::from(w2));
    Ok(())
}

/// Windows: do not show a system console for the child process. Stdio is still written to the log.
#[cfg(windows)]
fn maybe_hide_console_on_windows(c: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    c.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn maybe_hide_console_on_windows(_c: &mut Command) {}

fn spawn_engine_process(
    app: &tauri::AppHandle,
    port: u16,
) -> Result<(Child, PathBuf), String> {
    let app_dir = app_data_dir(app)?;
    std::fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    let logs = app_dir.join("logs");
    std::fs::create_dir_all(&logs).map_err(|e| e.to_string())?;
    rotate_engine_logs(&logs).map_err(|e| e.to_string())?;
    let log_path = logs.join(engine_log_name());

    let db_path = app_dir.join("cash_cat.db");
    let db_path_str = db_path.to_string_lossy().into_owned();

    if let Some(exe_dir) = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(std::path::Path::to_path_buf))
    {
        for name in sidecar_names_to_try() {
            let sidecar = exe_dir.join(name);
            if sidecar.is_file() {
                let mut c = Command::new(&sidecar);
                c.env("CASH_CAT_DB_PATH", &db_path_str).args([
                    "--host",
                    "127.0.0.1",
                    "--port",
                    &port.to_string(),
                ]);
                maybe_hide_console_on_windows(&mut c);
                add_stdio_to_log(&mut c, &log_path)?;
                return c.spawn().map(|ch| (ch, log_path)).map_err(|e| {
                    format!("failed to spawn engine sidecar {}: {e}", sidecar.display())
                });
            }
        }
    }

    #[cfg(debug_assertions)]
    {
        if let Some(engine_dir) = resolve_bundled_engine_dir(app) {
            if engine_dir.join("cash_cat").join("app.py").exists() {
                return spawn_dev_python(
                    &engine_dir,
                    &db_path_str,
                    port,
                    &log_path,
                );
            }
        }
        let engine_dir = project_engine_dir();
        if engine_dir.join("cash_cat").join("app.py").exists() {
            return spawn_dev_python(&engine_dir, &db_path_str, port, &log_path);
        }
    }

    #[cfg(not(debug_assertions))]
    {
        return Err(
            "The Cash Cat engine (sidecar) was not found next to the application. Reinstall the app, or if you are building from source, run a full Tauri build so the sidecar is produced."
                .to_string(),
        );
    }

    #[cfg(debug_assertions)]
    {
        Err("Engine not found. For development, ensure the `engine` directory exists, or set up a packaged sidecar for release.".to_string())
    }
}

#[cfg(debug_assertions)]
fn spawn_dev_python(
    engine_dir: &Path,
    db_path_str: &str,
    port: u16,
    log_path: &Path,
) -> Result<(Child, PathBuf), String> {
    let py = if cfg!(windows) { "python" } else { "python3" };
    let engine_dir_str = engine_dir.to_string_lossy().into_owned();
    let mut c = Command::new(py);
    c.current_dir(engine_dir)
        .env("CASH_CAT_DB_PATH", db_path_str)
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
        ]);
    maybe_hide_console_on_windows(&mut c);
    add_stdio_to_log(&mut c, log_path)?;
    c.spawn()
        .map_err(|e| format!("failed to spawn engine ({py}): {e}"))
        .map(|ch| (ch, log_path.to_path_buf()))
}

fn health_response_ok(port: u16) -> bool {
    let addr = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
    let mut stream = match TcpStream::connect_timeout(&addr, Duration::from_millis(800)) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(1500)));
    let req = b"GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n";
    if stream.write_all(req).is_err() {
        return false;
    }
    let mut buf = [0u8; 64];
    let n = match stream.read(&mut buf) {
        Ok(n) if n > 0 => n,
        _ => return false,
    };
    let line = String::from_utf8_lossy(&buf[..n]);
    line
        .lines()
        .next()
        .is_some_and(|l| l.starts_with("HTTP/1.") && l.contains(" 200"))
}

fn start_readiness_watcher(inner: Arc<Mutex<EngineStateInner>>, gen: u64, port: u16) {
    std::thread::spawn(move || {
        for _ in 0..100 {
            std::thread::sleep(Duration::from_millis(100));
            {
                let mut g = match inner.lock() {
                    Ok(x) => x,
                    Err(_) => return,
                };
                if g.generation != gen {
                    return;
                }
                if let Some(ch) = g.child.as_mut() {
                    if ch.try_wait().ok().flatten().is_some() {
                        g.state = "failed".to_string();
                        g.error = Some(
                            "The engine process stopped before it was ready. See the log file for details."
                                .to_string(),
                        );
                        return;
                    }
                } else {
                    return;
                }
            }
            if health_response_ok(port) {
                if let Ok(mut g) = inner.lock() {
                    if g.generation == gen {
                        g.state = "ready".to_string();
                        g.error = None;
                    }
                }
                return;
            }
        }
        if let Ok(mut g) = inner.lock() {
            if g.generation == gen {
                g.state = "failed".to_string();
                g.error = Some(
                    "The engine did not become ready in time. See the log file for details."
                        .to_string(),
                );
            }
        }
    });
}

fn pick_free_port() -> u16 {
    use std::net::TcpListener;
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
    listener.local_addr().expect("addr").port()
}

fn boot_engine(app: &tauri::AppHandle, state: &EngineState) {
    let port = pick_free_port();
    let gen = NEXT_GENERATION.fetch_add(1, Ordering::Relaxed);

    if let Ok(mut g) = state.inner.lock() {
        g.port = port;
        g.generation = gen;
        g.state = "starting".to_string();
        g.error = None;
        g.log_path = None;
    }

    match spawn_engine_process(app, port) {
        Ok((child, log_path)) => {
            let log_str = log_path.to_string_lossy().into_owned();
            if let Ok(mut g) = state.inner.lock() {
                g.child = Some(child);
                g.log_path = Some(log_str);
            }
            let inner = state.inner.clone();
            start_readiness_watcher(inner, gen, port);
        }
        Err(e) => {
            if let Ok(mut g) = state.inner.lock() {
                g.state = "failed".to_string();
                g.error = Some(e);
            }
        }
    }
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct EngineStatusView {
    pub state: String,
    pub error: Option<String>,
    pub log_path: Option<String>,
    pub port: u16,
    pub base_url: String,
}

impl EngineState {
    fn view(&self) -> EngineStatusView {
        if let Ok(g) = self.inner.lock() {
            let base = format!("http://127.0.0.1:{}", g.port);
            return EngineStatusView {
                state: g.state.clone(),
                error: g.error.clone(),
                log_path: g.log_path.clone(),
                port: g.port,
                base_url: base,
            };
        }
        EngineStatusView {
            state: "failed".to_string(),
            error: Some("Internal error (engine state).".to_string()),
            log_path: None,
            port: 0,
            base_url: "http://127.0.0.1:0".to_string(),
        }
    }
}

#[tauri::command]
fn engine_status(state: tauri::State<'_, EngineState>) -> Result<EngineStatusView, String> {
    Ok(state.view())
}

#[tauri::command]
fn engine_base_url(state: tauri::State<'_, EngineState>) -> String {
    state.view().base_url
}

#[tauri::command]
fn app_data_dir_path(app: tauri::AppHandle) -> Result<String, String> {
    app_data_dir(&app)
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn open_engine_logs_dir(app: tauri::AppHandle) -> Result<(), String> {
    let app_dir = app_data_dir(&app)?;
    let logs = app_dir.join("logs");
    std::fs::create_dir_all(&logs).map_err(|e| e.to_string())?;
    opener::open(&logs).map_err(|e| e.to_string())
}

#[tauri::command]
fn retry_engine(state: tauri::State<'_, EngineState>) -> Result<(), String> {
    {
        if let Ok(mut g) = state.inner.lock() {
            if let Some(mut c) = g.child.take() {
                let _ = c.kill();
                let _ = c.wait();
            }
        }
    }
    boot_engine(&state.app, &state);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let state = EngineState {
                inner: Arc::new(Mutex::new(EngineStateInner::default())),
                app: handle.clone(),
            };
            let _ = boot_engine(&handle, &state);
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            engine_status,
            engine_base_url,
            app_data_dir_path,
            open_engine_logs_dir,
            retry_engine
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
