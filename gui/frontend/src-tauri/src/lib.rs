use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::Manager;

struct BackendProcess(Mutex<Option<Child>>);

fn find_backend_dir() -> std::path::PathBuf {
    // Strategy: walk up from the executable to find gui/backend/main.py
    // Works both in dev (src-tauri/target/debug/) and installed (/usr/bin/ with /usr/share/)
    let exe = std::env::current_exe().unwrap_or_default();

    // 1. Check relative to exe: ../../gui/backend (dev build)
    for ancestor in exe.ancestors().skip(1) {
        let candidate = ancestor.join("gui").join("backend").join("main.py");
        if candidate.exists() {
            return ancestor.join("gui").join("backend");
        }
    }

    // 2. Check /usr/share/rlinf-studio/backend (installed .deb)
    let sys_path = std::path::PathBuf::from("/usr/share/rlinf-studio/backend");
    if sys_path.join("main.py").exists() {
        return sys_path;
    }

    // 3. Check $HOME/RLinf/gui/backend (fallback)
    if let Ok(home) = std::env::var("HOME") {
        let home_path = std::path::PathBuf::from(home).join("RLinf/gui/backend");
        if home_path.join("main.py").exists() {
            return home_path;
        }
    }

    // Last resort: current dir
    std::path::PathBuf::from(".")
}

fn find_python(backend_dir: &std::path::Path) -> String {
    // Prefer the venv inside the backend dir
    let venv_python = backend_dir.join(".venv/bin/python");
    if venv_python.exists() {
        return venv_python.to_string_lossy().to_string();
    }
    "python3".to_string()
}

fn ensure_backend_venv(backend_dir: &std::path::Path, python: &str) {
    let venv_dir = backend_dir.join(".venv");
    if venv_dir.join("bin/python").exists() {
        return;
    }
    eprintln!("[RLinf Studio] Creating backend venv...");
    let _ = Command::new(python)
        .args(["-m", "venv", venv_dir.to_str().unwrap()])
        .status();

    let venv_pip = venv_dir.join("bin/pip");
    if venv_pip.exists() {
        eprintln!("[RLinf Studio] Installing backend dependencies...");
        let pyproject = backend_dir.join("pyproject.toml");
        if pyproject.exists() {
            let _ = Command::new(venv_pip.to_str().unwrap())
                .args(["install", "-e", backend_dir.to_str().unwrap()])
                .status();
        } else {
            let _ = Command::new(venv_pip.to_str().unwrap())
                .args([
                    "install", "fastapi", "uvicorn[standard]", "pydantic",
                    "pydantic-settings", "omegaconf",
                ])
                .status();
        }
    }
}

fn start_backend() -> Option<Child> {
    let backend_dir = find_backend_dir();
    let system_python = "python3".to_string();

    // Bootstrap venv if needed (first launch after install)
    ensure_backend_venv(&backend_dir, &system_python);

    let python = find_python(&backend_dir);

    eprintln!(
        "[RLinf Studio] Starting backend: {} -m uvicorn main:app --host 127.0.0.1 --port 18721 (cwd: {})",
        python,
        backend_dir.display()
    );

    match Command::new(&python)
        .args(["-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "18721"])
        .current_dir(&backend_dir)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
    {
        Ok(child) => {
            eprintln!("[RLinf Studio] Backend started, PID: {}", child.id());
            Some(child)
        }
        Err(e) => {
            eprintln!("[RLinf Studio] Failed to start backend: {}", e);
            None
        }
    }
}

#[tauri::command]
fn backend_status(state: tauri::State<BackendProcess>) -> String {
    let guard = state.0.lock().unwrap();
    match guard.as_ref() {
        Some(child) => format!("running (PID: {})", child.id()),
        None => "not running".to_string(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let child = start_backend();
            app.manage(BackendProcess(Mutex::new(child)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![backend_status])
        .build(tauri::generate_context!())
        .expect("error while building RLinf Studio")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit = event {
                let state: tauri::State<BackendProcess> = app.state();
                let mut guard = state.0.lock().unwrap();
                if let Some(ref mut child) = *guard {
                    eprintln!("[RLinf Studio] Shutting down backend (PID: {})", child.id());
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        });
}
