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

impl TerminalManager {
    pub fn spawn(
        &self,
        app: AppHandle,
        shell: String,
        args: Vec<String>,
        cwd: Option<String>,
    ) -> Result<String, String> {
        let pty_system = NativePtySystem::default();

        let mut builder = CommandBuilder::new(shell);
        builder.args(args);
        // TERM decente pro Unix (o ConPTY do Windows ignora).
        builder.env("TERM", "xterm-256color");
        let dir = cwd
            .filter(|c| Path::new(c).is_dir())
            .map(std::path::PathBuf::from)
            .or_else(dirs_home);
        if let Some(dir) = dir {
            builder.cwd(dir);
        }

        let pair = pty_system
            .openpty(PtySize { rows: 24, cols: 80, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| format!("Falha ao criar PTY: {e}"))?;

        let child = pair
            .slave
            .spawn_command(builder)
            .map_err(|e| format!("Falha ao iniciar o shell: {e}"))?;

        let master: Arc<Mutex<Box<dyn MasterPty + Send>>> = Arc::new(Mutex::new(pair.master));
        let reader = master
            .lock()
            .unwrap()
            .try_clone_reader()
            .map_err(|e| format!("Falha ao clonar reader: {e}"))?;
        let writer = Arc::new(Mutex::new(
            master
                .lock()
                .unwrap()
                .take_writer()
                .map_err(|e| format!("Falha ao obter writer: {e}"))?,
        ));
        let killer = Arc::new(Mutex::new(child.clone_killer()));

        let session_id = {
            let mut id = self.next_id.lock().unwrap();
            *id += 1;
            format!("term-{}", *id)
        };

        self.sessions.lock().unwrap().insert(
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

        Ok(session_id)
    }

    pub fn write(&self, session_id: &str, data: &str) -> Result<(), String> {
        let sessions = self.sessions.lock().unwrap();
        let s = sessions.get(session_id).ok_or("sessão não encontrada")?;
        let mut w = s.writer.lock().unwrap();
        w.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        w.flush().map_err(|e| e.to_string())
    }

    pub fn resize(&self, session_id: &str, rows: u16, cols: u16) -> Result<(), String> {
        let sessions = self.sessions.lock().unwrap();
        let s = sessions.get(session_id).ok_or("sessão não encontrada")?;
        // Guard num binding próprio: temporário na expressão-cauda viveria
        // além do `sessions` e o borrow checker recusa (E0597).
        let master = s.master.lock().unwrap();
        let r = master
            .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| e.to_string());
        r
    }

    pub fn kill(&self, session_id: &str) {
        if let Some(s) = self.sessions.lock().unwrap().remove(session_id) {
            let _ = s.killer.lock().unwrap().kill();
        }
    }
}

fn dirs_home() -> Option<std::path::PathBuf> {
    std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .map(std::path::PathBuf::from)
}
