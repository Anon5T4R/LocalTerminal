//! Bandeja + autostart. É o que faz o quake mode existir de verdade.
//!
//! # Por que isto não é um extra
//!
//! Até a v0.5.1 o quake mode só respondia **enquanto o app estava aberto**. Um
//! terminal que desce com uma tecla, mas só se você já tiver aberto o terminal
//! antes, resolve pouco: o valor do gênero (Quake/Guake/Yakuake) está em ele
//! estar SEMPRE lá. Sem bandeja e sem autostart, o recurso principal da v0.5.0
//! dependia de um passo manual que o usuário justamente não quer dar.
//!
//! # A intenção mora no app, NÃO no registro
//!
//! Padrão da suíte (receita original no LocalAgenda, replicada no LocalClip).
//! O `is_enabled()` do plugin só checa se a entrada em `...\CurrentVersion\Run`
//! EXISTE — nunca se ela aponta pro exe ATUAL. Se a entrada some (instalador,
//! limpador) ou envelhece (o app mudou de pasta), o app pararia de subir no
//! logon com a checkbox ainda marcada, e ninguém descobriria. Por isso a
//! intenção fica em `tray.json` e o `reconcile_autostart` REIMPÕE o registro a
//! cada boot.
//!
//! # Onde este app diverge do LocalClip (de propósito)
//!
//! No LocalClip, subir com `--hidden` só esconde a janela se "fechar minimiza
//! pra bandeja" estiver ligado — senão o usuário fecharia no X e o app morreria
//! escondido. Aqui `--hidden` **sempre** esconde: a bandeja é incondicional
//! (o app nunca fica inalcançável) e o ÚNICO motivo pra alguém ligar o autostart
//! deste app é ter o quake pronto em segundo plano. Estourar uma janela de
//! terminal em todo logon seria exatamente o oposto do pedido.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, WindowEvent};
use tauri_plugin_autostart::ManagerExt;

use crate::quake;

/// Argumento com que o autostart sobe o app: direto pra bandeja.
pub const HIDDEN_ARG: &str = "--hidden";

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct TrayConfig {
    /// `None` = o usuário nunca decidiu (instalação anterior à v0.6.0): herda
    /// o que já está no SO em vez de ligar ou desligar por conta própria.
    pub autostart: Option<bool>,
    /// Fechar a janela esconde em vez de sair. Default DESLIGADO: fechar no X
    /// e o app continuar vivo sem avisar é comportamento que precisa ser
    /// escolhido, não herdado.
    pub close_to_tray: bool,
}

pub struct TrayState(pub Mutex<TrayConfig>);

fn config_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join("tray.json"))
}

pub fn load(path: &Path) -> TrayConfig {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str::<TrayConfig>(&s).ok())
        .unwrap_or_default()
}

pub fn save(path: &Path, cfg: &TrayConfig) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(path, serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}

fn read(app: &AppHandle) -> TrayConfig {
    app.state::<TrayState>().0.lock().unwrap_or_else(|p| p.into_inner()).clone()
}

fn write(app: &AppHandle, cfg: &TrayConfig) -> Result<(), String> {
    let path = config_path(app).ok_or("app_data indisponível")?;
    save(&path, cfg)?;
    *app.state::<TrayState>().0.lock().unwrap_or_else(|p| p.into_inner()) = cfg.clone();
    Ok(())
}

// ---------------------------------------------------------------------------
// Autostart
// ---------------------------------------------------------------------------

/// O que o SO tem hoje, do ponto de vista de "precisa consertar?".
#[derive(Debug, PartialEq, Eq)]
pub enum OsAutostart {
    /// Entrada presente e apontando pro exe atual — nada a fazer.
    Ok,
    /// Ausente ou apontando pro caminho errado (instalação movida) — reimpor.
    Broken,
    /// Desligado pelo Gerenciador de Tarefas do Windows. É escolha explícita do
    /// usuário, na UI oficial do SO: obedecemos e desmarcamos a checkbox.
    UserDisabled,
}

/// Decide o estado a partir dos valores CRUS do registro. Pura de propósito: o
/// caso que importa (entrada obsoleta apontando pro exe antigo) é impossível de
/// montar mexendo no registro da máquina de teste sem sujeira.
///
/// `run_value` é o que está em `...\CurrentVersion\Run` (`None` = ausente);
/// `approved` são os bytes de `StartupApproved\Run` (`None` = sem override).
pub fn classify_autostart(
    run_value: Option<&str>,
    approved: Option<&[u8]>,
    current_exe: &str,
) -> OsAutostart {
    // Override do Gerenciador de Tarefas: 12 bytes = flag (DWORD) + FILETIME de
    // quando foi desligado. No flag, bit 0 ligado = desabilitado; quando
    // habilitado o timestamp fica zerado. Checamos os DOIS: o `auto-launch` só
    // olha o timestamp, o que não enxerga flag desligada com timestamp zerado.
    if let Some(b) = approved {
        let flag_off = b.first().map(|f| f & 1 != 0).unwrap_or(false);
        let stamped_off = b.len() >= 12 && !b[4..12].iter().all(|x| *x == 0);
        if flag_off || stamped_off {
            return OsAutostart::UserDisabled;
        }
    }
    // O `auto-launch` grava `"<exe> <args>"`, sem aspas.
    let expected = format!("{current_exe} {HIDDEN_ARG}");
    match run_value {
        Some(v) if v.trim().eq_ignore_ascii_case(expected.trim()) => OsAutostart::Ok,
        _ => OsAutostart::Broken,
    }
}

#[cfg(windows)]
fn os_autostart(app: &AppHandle) -> OsAutostart {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ};
    use winreg::RegKey;

    const RUN: &str = r"SOFTWARE\Microsoft\Windows\CurrentVersion\Run";
    const APPROVED: &str =
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";

    let name = &app.package_info().name;
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);

    let approved = hkcu
        .open_subkey_with_flags(APPROVED, KEY_READ)
        .ok()
        .and_then(|k| k.get_raw_value(name).ok())
        .map(|v| v.bytes);
    let run = hkcu
        .open_subkey_with_flags(RUN, KEY_READ)
        .ok()
        .and_then(|k| k.get_value::<String, _>(name).ok());
    let current = std::env::current_exe().map(|p| p.display().to_string()).unwrap_or_default();

    classify_autostart(run.as_deref(), approved.as_deref(), &current)
}

/// Fora do Windows não há registro pra envelhecer: o `is_enabled()` basta.
#[cfg(not(windows))]
fn os_autostart(app: &AppHandle) -> OsAutostart {
    if app.autolaunch().is_enabled().unwrap_or(false) {
        OsAutostart::Ok
    } else {
        OsAutostart::Broken
    }
}

/// Intenção do usuário. `None` no arquivo = nunca decidiu: herda o SO.
fn autostart_intent(app: &AppHandle) -> bool {
    read(app).autostart.unwrap_or_else(|| app.autolaunch().is_enabled().unwrap_or(false))
}

/// Alinha o SO com a intenção guardada, a cada boot. É isto que conserta a
/// entrada apagada por um instalador ou apontando pro caminho antigo — sem
/// isso o app pararia de subir no logon, calado, com a checkbox marcada.
pub fn reconcile_autostart(app: &AppHandle) {
    let mut want = autostart_intent(app);
    let state = os_autostart(app);

    // O Gerenciador de Tarefas vence a checkbox: se o usuário desligou por lá,
    // a intenção passa a ser essa — senão reimporíamos a cada boot, brigando
    // com a UI oficial do sistema.
    if want && state == OsAutostart::UserDisabled {
        want = false;
    }
    let mut cfg = read(app);
    cfg.autostart = Some(want);
    let _ = write(app, &cfg);

    let mgr = app.autolaunch();
    let res = match (want, &state) {
        (true, OsAutostart::Broken) => mgr.enable(),
        (false, OsAutostart::Ok) => mgr.disable(),
        _ => Ok(()),
    };
    if let Err(e) = res {
        eprintln!("[localterminal] falha ao reconciliar o autostart (want={want}, so={state:?}): {e}");
    }
}

// ---------------------------------------------------------------------------
// Janela principal
// ---------------------------------------------------------------------------

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn toggle_main(app: &AppHandle) {
    let Some(w) = app.get_webview_window("main") else { return };
    if w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false) {
        let _ = w.hide();
    } else {
        show_main(app);
    }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

pub fn init_state(app: &AppHandle) {
    let cfg = config_path(app).map(|p| load(&p)).unwrap_or_default();
    app.manage(TrayState(Mutex::new(cfg)));
}

/// Monta a bandeja. Incondicional: é ela que garante que o app escondido nunca
/// fique inalcançável, e é a premissa que permite o `--hidden` sempre esconder.
pub fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let abrir = MenuItem::with_id(app, "abrir", "Abrir o LocalTerminal", true, None::<&str>)?;
    let quake_item =
        MenuItem::with_id(app, "quake", "Mostrar/ocultar o terminal rápido", true, None::<&str>)?;
    let sair = MenuItem::with_id(app, "sair", "Sair", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&abrir, &quake_item, &sair])?;

    TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().expect("ícone padrão da janela").clone())
        .tooltip("LocalTerminal")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "abrir" => show_main(app),
            // Pelo menu a alternância do quake funciona mesmo quando o atalho
            // global falhou por conflito — é a saída pra quem viu o aviso.
            "quake" => quake::toggle(app),
            // "Sair" SEMPRE fecha de verdade, mesmo com "fechar esconde" ligado.
            "sair" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

/// `CloseRequested` vira `hide` quando a opção está ligada.
pub fn hook_close_to_tray(app: &AppHandle) {
    let Some(win) = app.get_webview_window("main") else { return };
    let w = win.clone();
    let handle = app.clone();
    win.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            if read(&handle).close_to_tray {
                api.prevent_close();
                let _ = w.hide();
            }
        }
    });
}

/// Subiu pelo logon (`--hidden`): fica só na bandeja. Ver o comentário do topo
/// pra por que aqui isto é incondicional, ao contrário do LocalClip.
pub fn hide_if_started_hidden(app: &AppHandle) {
    if std::env::args().any(|a| a == HIDDEN_ARG) {
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.hide();
        }
    }
}

// ---------------------------------------------------------------------------
// Comandos
// ---------------------------------------------------------------------------

#[tauri::command(async)]
pub fn tray_config(app: AppHandle) -> TrayConfig {
    let mut cfg = read(&app);
    // A UI precisa de um booleano pra checkbox; `None` vira o que o SO tem.
    cfg.autostart = Some(autostart_intent(&app));
    cfg
}

#[tauri::command(async)]
pub fn tray_config_set(app: AppHandle, cfg: TrayConfig) -> Result<(), String> {
    // A intenção primeiro: se mexer no registro falhar, o reconcile do próximo
    // boot tenta de novo em vez de esquecer o que o usuário pediu.
    write(&app, &cfg)?;
    let mgr = app.autolaunch();
    match cfg.autostart {
        Some(true) => {
            // NUNCA `disable().and_then(enable)`: o `disable()` erra quando não
            // há entrada, e o erro mataria o enable que interessa. O disable
            // solto existe pra limpar uma entrada obsoleta antes de regravar.
            let _ = mgr.disable();
            mgr.enable().map_err(|e| e.to_string())
        }
        Some(false) => mgr.disable().map_err(|e| e.to_string()),
        None => Ok(()),
    }
}

// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    const EXE: &str = r"C:\Users\J\AppData\Local\LocalTerminal\LocalTerminal.exe";

    fn run_value(exe: &str) -> String {
        format!("{exe} {HIDDEN_ARG}")
    }

    #[test]
    fn entrada_apontando_pro_exe_atual_esta_ok() {
        assert_eq!(classify_autostart(Some(&run_value(EXE)), None, EXE), OsAutostart::Ok);
    }

    #[test]
    fn entrada_ausente_precisa_ser_reimposta() {
        assert_eq!(classify_autostart(None, None, EXE), OsAutostart::Broken);
    }

    /// O caso que motiva o módulo inteiro: o app mudou de pasta e a entrada
    /// velha continua lá. O `is_enabled()` do plugin diria "sim" — e o app não
    /// subiria mais, com a checkbox marcada.
    #[test]
    fn entrada_obsoleta_e_broken_mesmo_existindo() {
        let velho = r"C:\Program Files\LocalTerminal\LocalTerminal.exe";
        assert_eq!(classify_autostart(Some(&run_value(velho)), None, EXE), OsAutostart::Broken);
    }

    #[test]
    fn entrada_sem_o_argumento_hidden_e_broken() {
        // Sem `--hidden` o app subiria com a janela na cara do usuário.
        assert_eq!(classify_autostart(Some(EXE), None, EXE), OsAutostart::Broken);
    }

    #[test]
    fn caixa_do_caminho_nao_importa() {
        // O Windows não diferencia maiúsculas em caminho; comparar sensível
        // marcaria como obsoleta uma entrada perfeitamente boa e a regravaria
        // a cada boot.
        let outra_caixa = run_value(&EXE.to_uppercase());
        assert_eq!(classify_autostart(Some(&outra_caixa), None, EXE), OsAutostart::Ok);
    }

    #[test]
    fn gerenciador_de_tarefas_desligou_pela_flag() {
        // bit 0 ligado = desabilitado, com timestamp ZERADO. É o caso que o
        // `auto-launch` não enxerga, porque ele só olha o timestamp.
        let mut b = vec![0u8; 12];
        b[0] = 3;
        assert_eq!(
            classify_autostart(Some(&run_value(EXE)), Some(&b), EXE),
            OsAutostart::UserDisabled
        );
    }

    #[test]
    fn gerenciador_de_tarefas_desligou_pelo_timestamp() {
        let mut b = vec![0u8; 12];
        b[0] = 2;
        b[4] = 0x11; // FILETIME não-zero = data em que foi desligado
        assert_eq!(
            classify_autostart(Some(&run_value(EXE)), Some(&b), EXE),
            OsAutostart::UserDisabled
        );
    }

    #[test]
    fn habilitado_no_gerenciador_nao_conta_como_desligado() {
        let b = vec![2u8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        assert_eq!(classify_autostart(Some(&run_value(EXE)), Some(&b), EXE), OsAutostart::Ok);
    }

    #[test]
    fn approved_truncado_nao_estoura() {
        // Valor curto/corrompido não pode derrubar o boot: sem os 12 bytes só
        // a flag vale.
        assert_eq!(classify_autostart(Some(&run_value(EXE)), Some(&[2u8]), EXE), OsAutostart::Ok);
        assert_eq!(classify_autostart(Some(&run_value(EXE)), Some(&[]), EXE), OsAutostart::Ok);
    }

    #[test]
    fn config_padrao_nao_liga_nada() {
        // Ligar autostart ou "fechar esconde" sem ninguém pedir é mudar o
        // comportamento da máquina do usuário por conta própria.
        let c = TrayConfig::default();
        assert_eq!(c.autostart, None, "None = herda o SO, não 'ligado'");
        assert!(!c.close_to_tray);
    }

    #[test]
    fn json_corrompido_cai_no_padrao() {
        let dir = std::env::temp_dir().join(format!("lt-tray-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("tray.json");
        std::fs::write(&p, "não é json").unwrap();
        assert_eq!(load(&p), TrayConfig::default());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn ida_e_volta_do_arquivo() {
        let dir = std::env::temp_dir().join(format!("lt-tray-rt-{}", std::process::id()));
        let p = dir.join("tray.json");
        let cfg = TrayConfig { autostart: Some(true), close_to_tray: true };
        save(&p, &cfg).unwrap();
        assert_eq!(load(&p), cfg);
        std::fs::remove_dir_all(&dir).ok();
    }

    /// Arquivo da v0.5.x não tem estas chaves: tem que abrir sem apagar nada.
    #[test]
    fn arquivo_sem_as_chaves_novas_le_como_indeciso() {
        let dir = std::env::temp_dir().join(format!("lt-tray-old-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("tray.json");
        std::fs::write(&p, "{}").unwrap();
        let c = load(&p);
        assert_eq!(c.autostart, None);
        assert!(!c.close_to_tray);
        std::fs::remove_dir_all(&dir).ok();
    }
}
