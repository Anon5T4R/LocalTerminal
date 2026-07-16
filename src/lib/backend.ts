import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

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

export function spawnTerminal(
  shell: string,
  args: string[],
  cwd: string | null,
): Promise<string> {
  return invoke("spawn_terminal", { shell, args, cwd });
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
