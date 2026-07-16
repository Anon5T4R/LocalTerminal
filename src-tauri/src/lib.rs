mod shells;
mod terminal;

use tauri::{AppHandle, Manager, State};

use shells::ShellProfile;
use terminal::TerminalManager;

/// Shells disponíveis nesta máquina (perfis da UI).
#[tauri::command(async)]
fn list_shells() -> Vec<ShellProfile> {
    shells::detect_shells()
}

/// Abre um PTY com o shell/args (a UI manda o perfil escolhido).
#[tauri::command(async)]
fn spawn_terminal(
    app: AppHandle,
    mgr: State<'_, TerminalManager>,
    shell: String,
    args: Vec<String>,
    cwd: Option<String>,
) -> Result<String, String> {
    mgr.spawn(app, shell, args, cwd)
}

#[tauri::command(async)]
fn write_terminal(
    mgr: State<'_, TerminalManager>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    mgr.write(&session_id, &data)
}

#[tauri::command(async)]
fn resize_terminal(
    mgr: State<'_, TerminalManager>,
    session_id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    mgr.resize(&session_id, rows, cols)
}

#[tauri::command(async)]
fn kill_terminal(mgr: State<'_, TerminalManager>, session_id: String) {
    mgr.kill(&session_id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        // Segunda instância: só foca a janela (terminal novo = Ctrl+Shift+T).
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .manage(TerminalManager::default())
        .invoke_handler(tauri::generate_handler![
            list_shells,
            spawn_terminal,
            write_terminal,
            resize_terminal,
            kill_terminal,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
