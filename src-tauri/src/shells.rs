//! Detecção dos shells disponíveis na máquina (perfis da UI).
//! Windows: PowerShell 7 · Windows PowerShell · cmd · Git Bash · WSL (por
//! distro). Unix: $SHELL + bash/zsh/fish presentes.

use std::path::{Path, PathBuf};

use serde::Serialize;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ShellProfile {
    pub id: String,
    pub name: String,
    pub shell: String,
    pub args: Vec<String>,
}

#[cfg(windows)]
pub fn detect_shells() -> Vec<ShellProfile> {
    let mut out: Vec<ShellProfile> = Vec::new();

    // PowerShell 7 (pwsh) — PATH ou instalação padrão.
    if which("pwsh.exe").is_some() {
        out.push(ShellProfile {
            id: "pwsh".into(),
            name: "PowerShell".into(),
            shell: "pwsh.exe".into(),
            args: vec!["-NoLogo".into()],
        });
    }
    // Windows PowerShell (sempre existe).
    out.push(ShellProfile {
        id: "powershell".into(),
        name: "Windows PowerShell".into(),
        shell: "powershell.exe".into(),
        args: vec!["-NoLogo".into()],
    });
    // cmd (sempre existe).
    out.push(ShellProfile {
        id: "cmd".into(),
        name: "Prompt de Comando".into(),
        shell: "cmd.exe".into(),
        args: vec![],
    });
    // Git Bash — via PATH do git ou caminhos padrão.
    if let Some(bash) = git_bash() {
        out.push(ShellProfile {
            id: "gitbash".into(),
            name: "Git Bash".into(),
            shell: bash.to_string_lossy().into_owned(),
            args: vec!["--login".into(), "-i".into()],
        });
    }
    // WSL — uma entrada por distro instalada.
    for distro in wsl_distros() {
        out.push(ShellProfile {
            id: format!("wsl-{distro}"),
            name: format!("WSL · {distro}"),
            shell: "wsl.exe".into(),
            args: vec!["-d".into(), distro],
        });
    }
    out
}

#[cfg(windows)]
fn which(exe: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path)
        .map(|p| p.join(exe))
        .find(|p| p.is_file())
}

#[cfg(windows)]
fn git_bash() -> Option<PathBuf> {
    // 1) git.exe no PATH → ...\Git\cmd\git.exe → ...\Git\bin\bash.exe
    if let Some(git) = which("git.exe") {
        if let Some(root) = git.parent().and_then(|p| p.parent()) {
            let bash = root.join("bin").join("bash.exe");
            if bash.is_file() {
                return Some(bash);
            }
        }
    }
    // 2) caminhos padrão de instalação
    for base in ["C:\\Program Files\\Git", "C:\\Program Files (x86)\\Git"] {
        let bash = Path::new(base).join("bin").join("bash.exe");
        if bash.is_file() {
            return Some(bash);
        }
    }
    None
}

#[cfg(windows)]
fn wsl_distros() -> Vec<String> {
    // `wsl -l -q` sai em UTF-16LE; decodifica na mão. Sem WSL = lista vazia.
    let Ok(out) = std::process::Command::new("wsl.exe").args(["-l", "-q"]).output() else {
        return vec![];
    };
    if !out.status.success() {
        return vec![];
    }
    let bytes = &out.stdout;
    let utf16: Vec<u16> = bytes
        .chunks_exact(2)
        .map(|c| u16::from_le_bytes([c[0], c[1]]))
        .collect();
    String::from_utf16_lossy(&utf16)
        .lines()
        .map(|l| l.trim().trim_matches('\0').to_string())
        .filter(|l| !l.is_empty())
        .collect()
}

#[cfg(not(windows))]
pub fn detect_shells() -> Vec<ShellProfile> {
    let mut out: Vec<ShellProfile> = Vec::new();
    let user_shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".into());
    let user_name = user_shell.rsplit('/').next().unwrap_or("shell").to_string();
    out.push(ShellProfile {
        id: "default".into(),
        name: format!("{user_name} (padrão)"),
        shell: user_shell.clone(),
        args: vec![],
    });
    for (id, path) in [
        ("bash", "/bin/bash"),
        ("zsh", "/usr/bin/zsh"),
        ("fish", "/usr/bin/fish"),
    ] {
        if path != user_shell && Path::new(path).is_file() {
            out.push(ShellProfile {
                id: id.into(),
                name: id.into(),
                shell: path.into(),
                args: vec![],
            });
        }
    }
    out
}
