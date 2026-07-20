//! Motor de PTY — porte do LocalCode (`terminal.rs`) SEM tokio: aqui o app é
//! só o terminal, então Mutex/threads da std bastam. ConPTY no Windows,
//! openpty no Unix (o portable-pty resolve).

use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::{Arc, Mutex};

use portable_pty::{CommandBuilder, MasterPty, NativePtySystem, PtySize, PtySystem};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::profiles::{redact_env_for_log, resolve_cwd, sanitize_env, EnvVar};

/// Resultado do `spawn`: além do id, o que o backend teve que MUDAR do que foi
/// pedido. Antes o `cwd` inexistente virava HOME em silêncio e a variável de
/// ambiente inválida sumia; agora a UI recebe o desvio e avisa.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnResult {
    pub session_id: String,
    /// Diretório em que o shell realmente abriu.
    pub cwd: Option<String>,
    /// O diretório do perfil não existe mais (a UI mostra aviso).
    pub cwd_fallback: bool,
    /// Diretório que o perfil pedia (só pra montar a mensagem).
    pub requested_cwd: Option<String>,
    /// CHAVES das variáveis recusadas. Nunca os valores — perfil guarda token.
    pub rejected_env: Vec<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOutput {
    pub session_id: String,
    pub data: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalExit {
    pub session_id: String,
}

struct Session {
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    killer: Arc<Mutex<Box<dyn portable_pty::ChildKiller + Send + Sync>>>,
}

#[derive(Default)]
pub struct TerminalManager {
    sessions: Mutex<HashMap<String, Session>>,
    next_id: Mutex<u64>,
}

/// Trava um Mutex recuperando de poison: se outra thread panicou com a trava,
/// seguir com o dado como está é melhor que panicar em cascata e derrubar o
/// processo inteiro (todas as abas do terminal).
fn lock_ok<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|p| p.into_inner())
}

impl TerminalManager {
    pub fn spawn(
        &self,
        app: AppHandle,
        shell: String,
        args: Vec<String>,
        cwd: Option<String>,
        env: Vec<EnvVar>,
    ) -> Result<SpawnResult, String> {
        let pty_system = NativePtySystem::default();

        let mut builder = CommandBuilder::new(shell);
        builder.args(args);
        // TERM decente pro Unix (o ConPTY do Windows ignora).
        builder.env("TERM", "xterm-256color");

        // Variáveis do perfil. As recusadas voltam SÓ pela chave.
        let (env_ok, env_bad) = sanitize_env(&env);
        for (k, v) in &env_ok {
            builder.env(k, v);
        }
        if !env_ok.is_empty() {
            // Única forma autorizada de imprimir o ambiente de um perfil.
            eprintln!("[localterminal] {}", redact_env_for_log(&env_ok));
        }

        let home = dirs_home().map(|p| p.to_string_lossy().into_owned());
        let res = resolve_cwd(cwd.as_deref(), home.as_deref(), |p| Path::new(p).is_dir());
        if let Some(dir) = res.dir.as_deref() {
            builder.cwd(dir);
        }

        let pair = pty_system
            .openpty(PtySize { rows: 24, cols: 80, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| format!("Falha ao criar PTY: {e}"))?;

        let child = pair
            .slave
            .spawn_command(builder)
            .map_err(|e| format!("Falha ao iniciar o shell: {e}"))?;

        // Reader/writer saem do master ANTES de ele entrar no Mutex: aqui ele
        // ainda tem dono único, então não há trava (nem poison) pra tratar.
        let master_box = pair.master;
        let reader = master_box
            .try_clone_reader()
            .map_err(|e| format!("Falha ao clonar reader: {e}"))?;
        let writer = Arc::new(Mutex::new(
            master_box
                .take_writer()
                .map_err(|e| format!("Falha ao obter writer: {e}"))?,
        ));
        let master: Arc<Mutex<Box<dyn MasterPty + Send>>> = Arc::new(Mutex::new(master_box));
        let killer = Arc::new(Mutex::new(child.clone_killer()));

        let session_id = {
            let mut id = lock_ok(&self.next_id);
            *id += 1;
            format!("term-{}", *id)
        };

        lock_ok(&self.sessions).insert(
            session_id.clone(),
            Session { writer, master, killer },
        );

        // Thread leitora: PTY → evento pro xterm. Sai quando o shell morre.
        let sid = session_id.clone();
        std::thread::spawn(move || {
            let mut reader = reader;
            let mut buf = [0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();
                        let _ = app.emit("terminal-output", TerminalOutput {
                            session_id: sid.clone(),
                            data,
                        });
                    }
                }
            }
            let _ = app.emit("terminal-exit", TerminalExit { session_id: sid });
        });

        Ok(SpawnResult {
            session_id,
            cwd: res.dir,
            cwd_fallback: res.fell_back,
            requested_cwd: res.requested,
            rejected_env: env_bad.into_iter().map(|(k, _)| k).collect(),
        })
    }

    pub fn write(&self, session_id: &str, data: &str) -> Result<(), String> {
        let sessions = lock_ok(&self.sessions);
        let s = sessions.get(session_id).ok_or("sessão não encontrada")?;
        let mut w = lock_ok(&s.writer);
        w.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        w.flush().map_err(|e| e.to_string())
    }

    pub fn resize(&self, session_id: &str, rows: u16, cols: u16) -> Result<(), String> {
        let sessions = lock_ok(&self.sessions);
        let s = sessions.get(session_id).ok_or("sessão não encontrada")?;
        // Guard num binding próprio: temporário na expressão-cauda viveria
        // além do `sessions` e o borrow checker recusa (E0597).
        let master = lock_ok(&s.master);
        let r = master
            .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| e.to_string());
        r
    }

    pub fn kill(&self, session_id: &str) {
        if let Some(s) = lock_ok(&self.sessions).remove(session_id) {
            let _ = lock_ok(&s.killer).kill();
        }
    }
}

fn dirs_home() -> Option<std::path::PathBuf> {
    std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .map(std::path::PathBuf::from)
}
