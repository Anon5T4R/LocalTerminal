import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { EnvVar, TermProfile } from "./profiles";

/** Rodando dentro do Tauri? (o smoke em navegador puro não tem a ponte.) */
export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface ShellProfile {
  id: string;
  name: string;
  shell: string;
  args: string[];
}

export function listShells(): Promise<ShellProfile[]> {
  return invoke("list_shells");
}

/** O que o backend teve que MUDAR do que foi pedido (ver `SpawnResult`). */
export interface SpawnResult {
  sessionId: string;
  cwd: string | null;
  cwdFallback: boolean;
  requestedCwd: string | null;
  /** CHAVES das variáveis recusadas — nunca os valores. */
  rejectedEnv: string[];
}

export function spawnTerminal(
  shell: string,
  args: string[],
  cwd: string | null,
  env: EnvVar[] = [],
): Promise<SpawnResult> {
  return invoke("spawn_terminal", { shell, args, cwd, env });
}

// --- Perfis -----------------------------------------------------------------

export function profilesGet(): Promise<TermProfile[]> {
  return invoke("profiles_get");
}

export function profilesSet(profiles: TermProfile[]): Promise<void> {
  return invoke("profiles_set", { profiles });
}

// --- Quake mode -------------------------------------------------------------

export interface QuakeConfig {
  enabled: boolean;
  shortcut: string;
  heightPct: number;
  widthPct: number;
  profileId: string | null;
}

export function quakeConfig(): Promise<QuakeConfig> {
  return invoke("quake_config");
}

/** Rejeita com `SHORTCUT_BUSY:...` quando o sistema recusa a combinação. */
export function quakeConfigSet(cfg: QuakeConfig): Promise<void> {
  return invoke("quake_config_set", { cfg });
}

export function quakeHide(): Promise<void> {
  return invoke("quake_hide");
}

export function onQuakeShown(cb: () => void): Promise<UnlistenFn> {
  return listen("quake-shown", () => cb());
}

export function onQuakeHiding(cb: () => void): Promise<UnlistenFn> {
  return listen("quake-hiding", () => cb());
}

/** O atalho não registrou no boot (outro app tem a combinação). */
export function onQuakeShortcutFailed(cb: (accel: string) => void): Promise<UnlistenFn> {
  return listen<string>("quake-shortcut-failed", (e) => cb(e.payload));
}

// --- "Abrir aqui" (LocalFiles) ---------------------------------------------

/** Diretório vindo da linha de comando no arranque, ou `null`. */
export function startupCwd(): Promise<string | null> {
  return invoke("startup_cwd");
}

/** Uma 2ª instância pediu "abrir aqui" — o app já estava aberto. */
export function onOpenCwd(cb: (dir: string) => void): Promise<UnlistenFn> {
  return listen<string>("open-cwd", (e) => cb(e.payload));
}

export function writeTerminal(sessionId: string, data: string): Promise<void> {
  return invoke("write_terminal", { sessionId, data });
}

export function resizeTerminal(sessionId: string, rows: number, cols: number): Promise<void> {
  return invoke("resize_terminal", { sessionId, rows, cols });
}

export function killTerminal(sessionId: string): Promise<void> {
  return invoke("kill_terminal", { sessionId });
}

interface TerminalOutput {
  sessionId: string;
  data: string;
}

/** Saída do PTY da sessão (retorna o unlisten). */
export function onTerminalOutput(
  sessionId: string,
  cb: (data: string) => void,
): Promise<UnlistenFn> {
  return listen<TerminalOutput>("terminal-output", (e) => {
    if (e.payload.sessionId === sessionId) cb(e.payload.data);
  });
}

export function onTerminalExit(sessionId: string, cb: () => void): Promise<UnlistenFn> {
  return listen<{ sessionId: string }>("terminal-exit", (e) => {
    if (e.payload.sessionId === sessionId) cb();
  });
}
