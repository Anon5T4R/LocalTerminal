//! Perfis do usuário: shell + diretório inicial + variáveis de ambiente +
//! aparência, salvos em `profiles.json` no app_data.
//!
//! Os perfis DETECTADOS (`shells.rs`) continuam existindo e não são gravados —
//! eles são o catálogo da máquina. Um perfil daqui é uma escolha do usuário e
//! sobrevive a reinstalação do shell.
//!
//! # Duas decisões que valem comentário
//!
//! 1. **Diretório que não existe mais.** O `spawn` antigo filtrava com
//!    `is_dir()` e caía no HOME em silêncio — o usuário abria o perfil "Projeto
//!    X", via o prompt no HOME e não tinha como saber por quê. Agora a
//!    resolução é uma função pura que DIZ que houve queda (`fell_back`), e a UI
//!    avisa. Falha explícita é melhor que perda silenciosa.
//! 2. **Valor de variável de ambiente nunca vai pra log.** Perfil é o lugar
//!    natural pra guardar `GITHUB_TOKEN`/`AWS_SECRET_ACCESS_KEY`. Todo caminho
//!    de diagnóstico passa por `redact_env_for_log`, que emite só as CHAVES.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

/// Par de variável de ambiente de um perfil.
#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct EnvVar {
    pub key: String,
    pub value: String,
}

/// Perfil salvo pelo usuário.
#[derive(Debug, Default, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct TermProfile {
    pub id: String,
    pub name: String,
    /// Executável do shell (vem do perfil detectado, mas é editável).
    pub shell: String,
    pub args: Vec<String>,
    /// Diretório inicial. `None`/vazio = HOME.
    pub cwd: Option<String>,
    pub env: Vec<EnvVar>,
    // Aparência — `None` = herda das Configurações gerais.
    pub font_family: Option<String>,
    pub font_size: Option<u16>,
    pub theme: Option<String>,
}

/// Arquivo `profiles.json`. Envelope com `version` pra migração futura: sem
/// ele, um app novo lendo um arquivo antigo teria que adivinhar o formato.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfilesFile {
    pub version: u32,
    #[serde(default)]
    pub profiles: Vec<TermProfile>,
}

impl Default for ProfilesFile {
    fn default() -> Self {
        ProfilesFile { version: 1, profiles: Vec::new() }
    }
}

pub struct ProfilesState(pub Mutex<ProfilesFile>);

fn profiles_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join("profiles.json"))
}

pub fn load_profiles(path: &Path) -> ProfilesFile {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str::<ProfilesFile>(&s).ok())
        .unwrap_or_default()
}

pub fn save_profiles(path: &Path, f: &ProfilesFile) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(f).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Decisões puras (testáveis sem SO)
// ---------------------------------------------------------------------------

/// Onde o shell vai abrir, e se isso é o que o usuário pediu.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CwdResolution {
    /// Diretório efetivo (`None` = deixa o SO escolher).
    pub dir: Option<String>,
    /// O diretório pedido não existe mais e caímos no fallback.
    pub fell_back: bool,
    /// O que o usuário tinha pedido (pra mensagem de aviso).
    pub requested: Option<String>,
}

/// Resolve o diretório inicial. `exists` é injetado pra o teste não precisar
/// de disco — e pra a produção e o teste chamarem a MESMA função (lição do
/// LocalFiles 0.5.1: teste que não chama a produção vira cópia da lógica).
pub fn resolve_cwd<F>(requested: Option<&str>, home: Option<&str>, exists: F) -> CwdResolution
where
    F: Fn(&str) -> bool,
{
    let req = requested.map(str::trim).filter(|s| !s.is_empty());
    match req {
        Some(r) if exists(r) => CwdResolution {
            dir: Some(r.to_string()),
            fell_back: false,
            requested: Some(r.to_string()),
        },
        Some(r) => CwdResolution {
            dir: home.map(str::to_string),
            fell_back: true,
            requested: Some(r.to_string()),
        },
        None => CwdResolution {
            dir: home.map(str::to_string),
            fell_back: false,
            requested: None,
        },
    }
}

/// Motivo de uma variável recusada.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EnvReject {
    EmptyKey,
    /// `=` no nome quebraria o par no `environ` do processo filho.
    EqualsInKey,
    /// NUL termina a string em toda API de processo do SO.
    NulByte,
}

/// Separa as variáveis válidas das recusadas. **A chave recusada volta sem o
/// valor** — quem chama monta mensagem de erro com isso, e mensagem de erro é
/// exatamente o lugar por onde um segredo vazaria.
#[allow(clippy::type_complexity)]
pub fn sanitize_env(pairs: &[EnvVar]) -> (Vec<(String, String)>, Vec<(String, EnvReject)>) {
    let mut ok = Vec::new();
    let mut bad = Vec::new();
    for p in pairs {
        let k = p.key.trim();
        if k.is_empty() {
            bad.push((String::new(), EnvReject::EmptyKey));
        } else if k.contains('=') {
            bad.push((k.to_string(), EnvReject::EqualsInKey));
        } else if k.contains('\0') || p.value.contains('\0') {
            bad.push((k.to_string(), EnvReject::NulByte));
        } else {
            ok.push((k.to_string(), p.value.clone()));
        }
    }
    (ok, bad)
}

/// Resumo pra log/diagnóstico: **só as chaves, nunca os valores**.
///
/// Um perfil guarda token de API. `format!("{:?}", env)` num `eprintln!` de
/// depuração jogaria o segredo no stderr — que no Windows vai pro console do
/// dev e, num app empacotado, pode acabar num arquivo de log. Esta é a única
/// forma autorizada de imprimir o ambiente de um perfil.
pub fn redact_env_for_log(pairs: &[(String, String)]) -> String {
    if pairs.is_empty() {
        return "env: (nenhuma)".to_string();
    }
    let keys: Vec<&str> = pairs.iter().map(|(k, _)| k.as_str()).collect();
    format!("env: {} variável(is) [{}] (valores omitidos)", keys.len(), keys.join(", "))
}

// Nota: a regra de nome único (colisão vira "Projeto (2)") vive SÓ no front
// (`src/lib/profiles.ts`). Duplicá-la aqui daria duas verdades que podem
// divergir — e o Rust nunca decide nome de perfil, só grava o que recebe.

#[cfg(test)]
fn uuid_like() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos().to_string())
        .unwrap_or_else(|_| "x".into())
}

// ---------------------------------------------------------------------------
// Comandos
// ---------------------------------------------------------------------------

fn read(app: &AppHandle) -> ProfilesFile {
    app.state::<ProfilesState>().0.lock().unwrap_or_else(|p| p.into_inner()).clone()
}

#[tauri::command(async)]
pub fn profiles_get(app: AppHandle) -> Vec<TermProfile> {
    read(&app).profiles
}

#[tauri::command(async)]
pub fn profiles_set(app: AppHandle, profiles: Vec<TermProfile>) -> Result<(), String> {
    let f = ProfilesFile { version: 1, profiles };
    let path = profiles_path(&app).ok_or("app_data indisponível")?;
    save_profiles(&path, &f)?;
    *app.state::<ProfilesState>().0.lock().unwrap_or_else(|p| p.into_inner()) = f;
    Ok(())
}

pub fn init_state(app: &AppHandle) {
    let f = profiles_path(app).map(|p| load_profiles(&p)).unwrap_or_default();
    app.manage(ProfilesState(Mutex::new(f)));
}

// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn ev(k: &str, v: &str) -> EnvVar {
        EnvVar { key: k.into(), value: v.into() }
    }

    #[test]
    fn cwd_que_existe_e_usado() {
        let r = resolve_cwd(Some("C:\\proj"), Some("C:\\home"), |p| p == "C:\\proj");
        assert_eq!(r.dir.as_deref(), Some("C:\\proj"));
        assert!(!r.fell_back);
    }

    #[test]
    fn cwd_apagado_cai_no_home_e_avisa() {
        // O caso que morde: o perfil aponta pra pasta de um projeto que o
        // usuário apagou. Antes o app abria no HOME calado.
        let r = resolve_cwd(Some("C:\\proj-apagado"), Some("C:\\home"), |_| false);
        assert_eq!(r.dir.as_deref(), Some("C:\\home"));
        assert!(r.fell_back, "queda pro HOME tem que ser sinalizada");
        assert_eq!(r.requested.as_deref(), Some("C:\\proj-apagado"));
    }

    #[test]
    fn cwd_vazio_nao_e_queda() {
        // Perfil sem diretório definido: abrir no HOME é o esperado, não um erro.
        for req in [None, Some(""), Some("   ")] {
            let r = resolve_cwd(req, Some("/home/j"), |_| false);
            assert!(!r.fell_back, "req={req:?} não deveria avisar");
            assert_eq!(r.dir.as_deref(), Some("/home/j"));
        }
    }

    #[test]
    fn cwd_com_espaco_em_volta_e_aparado() {
        let r = resolve_cwd(Some("  C:\\proj  "), None, |p| p == "C:\\proj");
        assert_eq!(r.dir.as_deref(), Some("C:\\proj"));
    }

    #[test]
    fn env_valido_passa() {
        let (ok, bad) = sanitize_env(&[ev("FOO", "bar"), ev(" SPACED ", "1")]);
        assert_eq!(ok, vec![("FOO".into(), "bar".into()), ("SPACED".into(), "1".into())]);
        assert!(bad.is_empty());
    }

    #[test]
    fn env_invalido_e_recusado_sem_o_valor() {
        let (ok, bad) = sanitize_env(&[
            ev("", "segredo-vazado"),
            ev("A=B", "segredo-vazado"),
            ev("C", "com\0nul"),
            ev("OK", "vale"),
        ]);
        assert_eq!(ok, vec![("OK".into(), "vale".into())]);
        assert_eq!(bad.len(), 3);
        assert_eq!(bad[0].1, EnvReject::EmptyKey);
        assert_eq!(bad[1].1, EnvReject::EqualsInKey);
        assert_eq!(bad[2].1, EnvReject::NulByte);
        // O ponto do teste: o relatório de recusa não carrega valor nenhum.
        let dump = format!("{bad:?}");
        assert!(!dump.contains("segredo-vazado"), "valor vazou no relatório: {dump}");
    }

    #[test]
    fn log_de_env_nunca_mostra_valor() {
        let (ok, _) = sanitize_env(&[ev("GITHUB_TOKEN", "ghp_supersecreto"), ev("PATH", "/x")]);
        let line = redact_env_for_log(&ok);
        assert!(line.contains("GITHUB_TOKEN"), "a chave ajuda a diagnosticar");
        assert!(line.contains('2'));
        assert!(!line.contains("ghp_supersecreto"), "SEGREDO NO LOG: {line}");
        assert!(!line.contains("/x"));
    }

    #[test]
    fn log_de_env_vazio() {
        assert_eq!(redact_env_for_log(&[]), "env: (nenhuma)");
    }

    #[test]
    fn arquivo_corrompido_nao_derruba_o_app() {
        let dir = std::env::temp_dir().join(format!("lt-prof-{}", uuid_like()));
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("profiles.json");
        std::fs::write(&p, "{ isso não é json").unwrap();
        assert_eq!(load_profiles(&p).profiles.len(), 0);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn ida_e_volta_preserva_o_perfil() {
        let dir = std::env::temp_dir().join(format!("lt-prof-rt-{}", uuid_like()));
        let p = dir.join("profiles.json");
        let f = ProfilesFile {
            version: 1,
            profiles: vec![TermProfile {
                id: "a".into(),
                name: "Projeto".into(),
                shell: "pwsh.exe".into(),
                args: vec!["-NoLogo".into()],
                cwd: Some("C:\\proj".into()),
                env: vec![ev("FOO", "bar")],
                font_family: None,
                font_size: Some(15),
                theme: Some("darkblue".into()),
            }],
        };
        save_profiles(&p, &f).unwrap();
        assert_eq!(load_profiles(&p), f);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn campo_faltando_no_json_antigo_usa_default() {
        // `#[serde(default)]`: um profiles.json escrito por versão anterior
        // (sem `theme`/`env`) tem que abrir, não zerar a lista inteira.
        let f: ProfilesFile = serde_json::from_str(
            r#"{"version":1,"profiles":[{"id":"a","name":"X","shell":"cmd.exe"}]}"#,
        )
        .unwrap();
        assert_eq!(f.profiles.len(), 1);
        assert!(f.profiles[0].env.is_empty());
        assert_eq!(f.profiles[0].theme, None);
    }
}
