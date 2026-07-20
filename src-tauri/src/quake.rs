//! Quake mode: um terminal que desce do topo da tela com um atalho global e
//! some com o mesmo atalho, sempre por cima.
//!
//! Desenho reusado da suíte (não inventado aqui):
//! * a janela é **declarada no `tauri.conf.json`** (label `quake`, `visible:
//!   false`), igual à janela rápida do LocalTranslate 0.4.0 — nasce escondida
//!   no boot e o atalho só mostra/esconde. Criar sob demanda com
//!   `WebviewWindowBuilder` custaria o tempo de carregar o webview no primeiro
//!   toque, que é justo o que um quake terminal não pode ter.
//! * o atalho é **configurável em runtime** e a falha de registro **sobe pra
//!   UI** (sentinela `SHORTCUT_BUSY:`), padrão do `quick.rs` do LocalTranslate.
//!
//! # O que NASCEU aqui (e por quê)
//!
//! 1. **Aviso de conflito no BOOT.** No LocalTranslate a falha de registro no
//!    boot só vira `eprintln!` — o usuário aperta a tecla, não acontece nada, e
//!    só descobre se abrir as Configurações e salvar de novo. Aqui o boot emite
//!    `quake-shortcut-failed` pra janela principal, que mostra um aviso. Atalho
//!    global é a ÚNICA porta do quake mode: falhar calado é entregar recurso
//!    morto.
//! 2. **Devolver o atalho ao sair** (`release_on_exit`), que o LocalTranslate
//!    não faz — atalho global é recurso do sistema.
//! 3. **Geometria própria** (`quake_bounds`): o LocalTranslate centraliza uma
//!    caixinha; aqui a janela cola no topo do monitor, e a conta tem que
//!    aguentar monitor com origem negativa (secundário à esquerda do
//!    principal), que é onde esse tipo de código costuma errar.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

pub const QUAKE_LABEL: &str = "quake";

/// Atalho padrão. `Alt+Backquote` porque:
/// * a crase é o costume do gênero (Quake/Guake/Yakuake);
/// * `Ctrl+Shift+~` briga com o "reabrir aba" do navegador e com o próprio
///   `Ctrl+Shift+T` do app;
/// * o nome do código (`Backquote`) é aceito pelo parser do plugin em qualquer
///   layout — escrever "`" literal depende do teclado e falha em ABNT2.
pub const DEFAULT_SHORTCUT: &str = "Alt+Backquote";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuakeConfig {
    pub enabled: bool,
    pub shortcut: String,
    /// Altura da janela em % da altura do monitor.
    pub height_pct: u8,
    /// Largura em % da largura do monitor (centralizada).
    pub width_pct: u8,
    /// Perfil usado pela aba do quake (`None` = o padrão das Configurações).
    pub profile_id: Option<String>,
}

impl Default for QuakeConfig {
    fn default() -> Self {
        QuakeConfig {
            enabled: false,
            shortcut: DEFAULT_SHORTCUT.to_string(),
            height_pct: 45,
            width_pct: 100,
            profile_id: None,
        }
    }
}

pub struct QuakeState(pub Mutex<QuakeConfig>);

fn config_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join("quake.json"))
}

pub fn load(path: &Path) -> QuakeConfig {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str::<QuakeConfig>(&s).ok())
        .unwrap_or_default()
}

pub fn save(path: &Path, cfg: &QuakeConfig) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(path, serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Geometria (pura)
// ---------------------------------------------------------------------------

/// Retângulo da janela quake em coordenadas FÍSICAS, colado no topo do monitor.
///
/// `mon_x`/`mon_y` são a origem do monitor no desktop virtual e podem ser
/// **negativos** (monitor à esquerda/acima do principal). As percentagens são
/// limitadas a 10..=100 pra não existir janela de 0 pixel — que abriria,
/// receberia foco e pareceria "o atalho não funciona".
pub fn quake_bounds(
    mon_x: i32,
    mon_y: i32,
    mon_w: u32,
    mon_h: u32,
    height_pct: u8,
    width_pct: u8,
) -> (i32, i32, u32, u32) {
    let hp = height_pct.clamp(10, 100) as u32;
    let wp = width_pct.clamp(10, 100) as u32;
    let w = (mon_w * wp / 100).max(1);
    let h = (mon_h * hp / 100).max(1);
    // Centraliza na horizontal; a sobra é dividida em duas (inteiro, então a
    // janela pode ficar 1px à esquerda do centro — irrelevante e estável).
    let x = mon_x + ((mon_w - w) / 2) as i32;
    (x, mon_y, w, h)
}

// ---------------------------------------------------------------------------
// Atalho
// ---------------------------------------------------------------------------

/// (Re)registra o atalho global. Erro do sistema (combinação já tomada por
/// outro app, ou string inválida) sai marcado com `SHORTCUT_BUSY:` pra a UI
/// poder traduzir em vez de mostrar o erro cru do plugin.
pub fn apply_shortcut(app: &AppHandle, cfg: &QuakeConfig) -> Result<(), String> {
    let gs = app.global_shortcut();
    // Solta tudo antes: sem isso o atalho ANTIGO continuaria valendo e o
    // usuário teria duas teclas abrindo o quake sem saber por quê.
    gs.unregister_all().map_err(|e| e.to_string())?;
    let accel = cfg.shortcut.trim();
    if !cfg.enabled || accel.is_empty() {
        return Ok(());
    }
    gs.register(accel).map_err(|e| format!("SHORTCUT_BUSY:{accel}:{e}"))
}

/// Chamado no `RunEvent::Exit`. Atalho global é recurso do SISTEMA: sair sem
/// devolver deixaria a combinação presa até o próximo logon.
pub fn release_on_exit(app: &AppHandle) {
    let _ = app.global_shortcut().unregister_all();
}

// ---------------------------------------------------------------------------
// Mostrar/esconder
// ---------------------------------------------------------------------------

/// Alterna a janela quake. Visível → esconde; escondida → posiciona no topo do
/// monitor atual, mostra e dá foco.
pub fn toggle(app: &AppHandle) {
    let Some(w) = app.get_webview_window(QUAKE_LABEL) else { return };
    if w.is_visible().unwrap_or(false) {
        let _ = app.emit_to(QUAKE_LABEL, "quake-hiding", ());
        let _ = w.hide();
        return;
    }
    let cfg = app.state::<QuakeState>().0.lock().unwrap_or_else(|p| p.into_inner()).clone();
    // Monitor sob o cursor; sem cursor (sessão remota, por ex.) cai no primário.
    let mon = w
        .cursor_position()
        .ok()
        .and_then(|p| w.monitor_from_point(p.x, p.y).ok().flatten())
        .or_else(|| w.primary_monitor().ok().flatten());
    if let Some(m) = mon {
        let pos = m.position();
        let size = m.size();
        let (x, y, ww, hh) =
            quake_bounds(pos.x, pos.y, size.width, size.height, cfg.height_pct, cfg.width_pct);
        let _ = w.set_size(PhysicalSize::new(ww, hh));
        let _ = w.set_position(PhysicalPosition::new(x, y));
    }
    let _ = w.show();
    let _ = w.set_focus();
    // O webview interno precisa de foco à parte quando a janela nasce
    // escondida — sem isso a tecla não chega no xterm (achado do LocalRecord,
    // repetido no LocalTranslate).
    let inner: &tauri::Webview<_> = w.as_ref();
    let _ = inner.set_focus();
    let _ = app.emit_to(QUAKE_LABEL, "quake-shown", ());
}

// ---------------------------------------------------------------------------
// Comandos
// ---------------------------------------------------------------------------

fn read(app: &AppHandle) -> QuakeConfig {
    app.state::<QuakeState>().0.lock().unwrap_or_else(|p| p.into_inner()).clone()
}

#[tauri::command(async)]
pub fn quake_config(app: AppHandle) -> QuakeConfig {
    read(&app)
}

#[tauri::command(async)]
pub fn quake_config_set(app: AppHandle, cfg: QuakeConfig) -> Result<(), String> {
    // Grava a INTENÇÃO antes de tentar registrar: se a combinação estiver
    // tomada, o que o usuário escolheu não pode sumir do formulário.
    let path = config_path(&app).ok_or("app_data indisponível")?;
    save(&path, &cfg)?;
    *app.state::<QuakeState>().0.lock().unwrap_or_else(|p| p.into_inner()) = cfg.clone();
    apply_shortcut(&app, &cfg)
}

#[tauri::command(async)]
pub fn quake_hide(app: AppHandle) {
    if let Some(w) = app.get_webview_window(QUAKE_LABEL) {
        let _ = w.hide();
    }
}

pub fn init_state(app: &AppHandle) {
    let cfg = config_path(app).map(|p| load(&p)).unwrap_or_default();
    app.manage(QuakeState(Mutex::new(cfg)));
}

/// Registra o atalho no boot. Falha aqui é COMUM (outro app já tem a
/// combinação) e não pode derrubar a abertura — vira aviso na janela principal.
pub fn apply_at_boot(app: &AppHandle) {
    let cfg = read(app);
    if let Err(e) = apply_shortcut(app, &cfg) {
        eprintln!("[localterminal] atalho global não registrado: {e}");
        // O que o LocalTranslate não faz: contar pra UI. Sem isso o recurso
        // fica morto e parece bug do app.
        let _ = app.emit_to("main", "quake-shortcut-failed", cfg.shortcut.clone());
    }
}

// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cola_no_topo_e_ocupa_a_largura_toda() {
        let (x, y, w, h) = quake_bounds(0, 0, 1920, 1080, 45, 100);
        assert_eq!((x, y, w), (0, 0, 1920));
        assert_eq!(h, 486);
    }

    #[test]
    fn largura_parcial_fica_centralizada() {
        let (x, _, w, _) = quake_bounds(0, 0, 1920, 1080, 50, 50);
        assert_eq!(w, 960);
        assert_eq!(x, 480, "sobra dividida em duas");
    }

    #[test]
    fn monitor_com_origem_negativa() {
        // Monitor secundário à ESQUERDA do principal: origem negativa. Uma
        // conta que ignorasse `mon_x` abriria a janela no monitor errado.
        let (x, y, w, _) = quake_bounds(-1920, -200, 1920, 1080, 40, 100);
        assert_eq!((x, y, w), (-1920, -200, 1920));
    }

    #[test]
    fn monitor_a_direita_com_alturas_diferentes() {
        let (x, y, _, h) = quake_bounds(1920, 0, 2560, 1440, 30, 80);
        assert_eq!(y, 0);
        assert_eq!(x, 1920 + (2560 - 2048) / 2);
        assert_eq!(h, 432);
    }

    #[test]
    fn percentual_absurdo_nunca_vira_janela_de_zero_pixel() {
        // Janela 0×0 abre, recebe foco e o usuário jura que "o atalho não
        // funciona". O clamp é o que impede isso.
        for pct in [0u8, 1, 5] {
            let (_, _, w, h) = quake_bounds(0, 0, 1920, 1080, pct, pct);
            assert!(w >= 192 && h >= 108, "pct={pct} deu {w}x{h}");
        }
        let (_, _, w, h) = quake_bounds(0, 0, 1920, 1080, 255, 255);
        assert_eq!((w, h), (1920, 1080), "acima de 100% satura no monitor");
    }

    #[test]
    fn monitor_minusculo_nao_zera() {
        let (_, _, w, h) = quake_bounds(0, 0, 5, 5, 10, 10);
        assert!(w >= 1 && h >= 1, "{w}x{h}");
    }

    #[test]
    fn config_padrao_vem_desligada() {
        // Ligado por padrão registraria uma combinação global na instalação de
        // todo mundo sem ninguém pedir — e roubaria a tecla de outro app.
        let c = QuakeConfig::default();
        assert!(!c.enabled);
        assert_eq!(c.shortcut, DEFAULT_SHORTCUT);
    }

    #[test]
    fn json_corrompido_cai_no_padrao() {
        let dir = std::env::temp_dir().join(format!("lt-quake-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("quake.json");
        std::fs::write(&p, "não é json").unwrap();
        assert_eq!(load(&p), QuakeConfig::default());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn ida_e_volta_do_arquivo() {
        let dir = std::env::temp_dir().join(format!("lt-quake-rt-{}", std::process::id()));
        let p = dir.join("quake.json");
        let cfg = QuakeConfig {
            enabled: true,
            shortcut: "Ctrl+Shift+Space".into(),
            height_pct: 70,
            width_pct: 90,
            profile_id: Some("pwsh".into()),
        };
        save(&p, &cfg).unwrap();
        assert_eq!(load(&p), cfg);
        std::fs::remove_dir_all(&dir).ok();
    }
}
