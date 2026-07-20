mod profiles;
mod quake;
mod shells;
mod terminal;
mod tray;

use tauri::{AppHandle, Emitter, Manager, State};

use profiles::EnvVar;
use shells::ShellProfile;
use terminal::{SpawnResult, TerminalManager};

/// Shells disponíveis nesta máquina (perfis da UI).
#[tauri::command(async)]
fn list_shells() -> Vec<ShellProfile> {
    shells::detect_shells()
}

/// Abre um PTY com o shell/args (a UI manda o perfil escolhido).
#[tauri::command(async)]
#[allow(clippy::too_many_arguments)]
fn spawn_terminal(
    app: AppHandle,
    mgr: State<'_, TerminalManager>,
    shell: String,
    args: Vec<String>,
    cwd: Option<String>,
    env: Option<Vec<EnvVar>>,
) -> Result<SpawnResult, String> {
    mgr.spawn(app, shell, args, cwd, env.unwrap_or_default())
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

/// Diretório passado na linha de comando (é assim que o LocalFiles pede
/// "abrir aqui"). `None` quando o app abriu normalmente.
#[tauri::command(async)]
fn startup_cwd() -> Option<String> {
    startup_dir_from(std::env::args().skip(1))
}

/// Extrai o diretório de `--cwd <path>`, `--cwd=<path>` ou de um argumento
/// posicional. Função PURA: a produção e o teste chamam esta mesma fn.
///
/// Aceitar posicional é o que faz `LocalTerminal.exe "C:\proj"` funcionar de
/// qualquer lugar (arrastar pasta no atalho, por ex.); o `--cwd` explícito é o
/// que o LocalFiles usa, porque é inequívoco.
fn startup_dir_from<I: IntoIterator<Item = String>>(args: I) -> Option<String> {
    let mut it = args.into_iter();
    while let Some(a) = it.next() {
        if let Some(rest) = a.strip_prefix("--cwd=") {
            let rest = rest.trim();
            if !rest.is_empty() {
                return Some(rest.to_string());
            }
        } else if a == "--cwd" {
            if let Some(v) = it.next() {
                let v = v.trim().to_string();
                if !v.is_empty() {
                    return Some(v);
                }
            }
        } else if !a.starts_with('-') && !a.is_empty() {
            // Posicional. Só vale se for pasta de verdade: um argumento solto
            // qualquer virando "diretório inicial" abriria o shell em lugar
            // nenhum e o usuário não saberia por quê.
            if std::path::Path::new(&a).is_dir() {
                return Some(a);
            }
        }
    }
    None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        // Segunda instância: foca a janela e, se veio com `--cwd`, abre uma
        // aba nova ali (é o caminho do "abrir aqui" do LocalFiles quando o
        // terminal JÁ está aberto — o caso comum).
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // Um 2º launch com `--hidden` é o logon batendo num app que já está
            // vivo: não estoura a janela na cara de quem está usando a máquina.
            if !args.iter().any(|a| a == tray::HIDDEN_ARG) {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.unminimize();
                    let _ = win.set_focus();
                }
            }
            if let Some(dir) = startup_dir_from(args.into_iter().skip(1)) {
                let _ = app.emit_to("main", "open-cwd", dir);
            }
        }));

        // Autostart: quando ligado, o app entra no logon com `--hidden` pra
        // ficar só na bandeja com o atalho do quake registrado. É o que faz o
        // quake mode existir sem o usuário abrir o app antes.
        builder = builder.plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![tray::HIDDEN_ARG]),
        ));

        builder = builder.plugin(
            // Sem atalho fixo: quem manda é o `quake.json`, aplicado no setup.
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    // Sem o filtro de Pressed o handler dispara 2x por toque
                    // (press + release) e a janela abriria e fecharia sozinha.
                    if event.state() == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        quake::toggle(app);
                    }
                })
                .build(),
        );
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .manage(TerminalManager::default())
        .setup(|app| {
            let handle = app.handle().clone();
            profiles::init_state(&handle);
            quake::init_state(&handle);
            quake::apply_at_boot(&handle);

            tray::init_state(&handle);
            tray::build_tray(&handle)?;
            tray::hook_close_to_tray(&handle);
            tray::hide_if_started_hidden(&handle);
            // Reimpõe o autostart conforme a intenção guardada. Numa thread à
            // parte: mexe no registro e não deve segurar a abertura da janela.
            let auto = handle.clone();
            std::thread::spawn(move || tray::reconcile_autostart(&auto));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_shells,
            spawn_terminal,
            write_terminal,
            resize_terminal,
            kill_terminal,
            startup_cwd,
            profiles::profiles_get,
            profiles::profiles_set,
            quake::quake_config,
            quake::quake_config_set,
            quake::quake_hide,
            tray::tray_config,
            tray::tray_config_set,
        ])
        .build(tauri::generate_context!())
        // Falha aqui é fatal por definição: sem o runtime Tauri não há app.
        .expect("erro ao iniciar a aplicação Tauri")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                // Atalho global é recurso do SISTEMA: sair sem devolver
                // deixaria a combinação presa até o próximo logon.
                quake::release_on_exit(app);
            }
        });
}

#[cfg(test)]
mod tests {
    use super::startup_dir_from;

    fn v(xs: &[&str]) -> Vec<String> {
        xs.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn sem_argumento_nao_ha_diretorio() {
        assert_eq!(startup_dir_from(v(&[])), None);
        assert_eq!(startup_dir_from(v(&["--quieto"])), None);
    }

    #[test]
    fn cwd_separado_e_com_igual() {
        assert_eq!(startup_dir_from(v(&["--cwd", "C:\\proj"])), Some("C:\\proj".into()));
        assert_eq!(startup_dir_from(v(&["--cwd=C:\\proj"])), Some("C:\\proj".into()));
    }

    #[test]
    fn cwd_com_espaco_no_caminho() {
        // "Meus Documentos" chega como UM argumento (o SO já desfez as aspas).
        assert_eq!(
            startup_dir_from(v(&["--cwd", "C:\\Users\\J\\Meus Documentos"])),
            Some("C:\\Users\\J\\Meus Documentos".into())
        );
    }

    #[test]
    fn cwd_sem_valor_nao_estoura() {
        assert_eq!(startup_dir_from(v(&["--cwd"])), None);
        assert_eq!(startup_dir_from(v(&["--cwd", "   "])), None);
        assert_eq!(startup_dir_from(v(&["--cwd="])), None);
    }

    #[test]
    fn posicional_so_vale_se_for_pasta() {
        let tmp = std::env::temp_dir();
        let tmp = tmp.to_string_lossy().to_string();
        assert_eq!(startup_dir_from(v(&[&tmp])), Some(tmp));
        // Texto solto que não é pasta é ignorado em vez de virar cwd inválido.
        assert_eq!(startup_dir_from(v(&["isto-nao-existe-12345"])), None);
    }

    #[test]
    fn cwd_explicito_ganha_do_posicional() {
        let tmp = std::env::temp_dir().to_string_lossy().to_string();
        assert_eq!(
            startup_dir_from(v(&["--cwd", "C:\\pedido", &tmp])),
            Some("C:\\pedido".into()),
            "o --cwd aparece primeiro e é o que o LocalFiles manda"
        );
    }

    #[test]
    fn flag_desconhecida_nao_vira_diretorio() {
        // `--hidden` (padrão de autostart da suíte) não pode virar cwd.
        assert_eq!(startup_dir_from(v(&["--hidden", "--verbose"])), None);
    }
}
