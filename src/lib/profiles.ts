/**
 * Perfis: shell + diretório inicial + variáveis de ambiente + aparência.
 *
 * A lista que a UI mostra é a UNIÃO de dois conjuntos com naturezas
 * diferentes, e misturá-los foi a decisão que mais moldou o arquivo:
 *
 * * **detectados** (`shells.rs`) — catálogo da MÁQUINA. Somem se o usuário
 *   desinstalar o shell, e não têm por que ser gravados em disco.
 * * **salvos** (`profiles.json`) — escolha do USUÁRIO. Sobrevivem a tudo,
 *   inclusive ao shell sumir — e nesse caso o perfil fica marcado como
 *   `missing`, porque apagar a configuração de alguém porque o `pwsh.exe`
 *   saiu do PATH seria perda silenciosa.
 */

import type { ShellProfile } from "./backend";

export interface EnvVar {
  key: string;
  value: string;
}

export interface TermProfile {
  id: string;
  name: string;
  shell: string;
  args: string[];
  cwd: string | null;
  env: EnvVar[];
  fontFamily: string | null;
  fontSize: number | null;
  theme: string | null;
}

/** Entrada do menu "novo terminal": perfil salvo OU shell detectado. */
export interface MenuEntry {
  id: string;
  name: string;
  saved: boolean;
  /** Perfil salvo cujo executável não está mais entre os detectados. */
  missing: boolean;
  profile: TermProfile;
}

/** Perfil "cru" a partir de um shell detectado (sem cwd/env/aparência). */
export function profileFromShell(s: ShellProfile): TermProfile {
  return {
    id: s.id,
    name: s.name,
    shell: s.shell,
    args: s.args,
    cwd: null,
    env: [],
    fontFamily: null,
    fontSize: null,
    theme: null,
  };
}

/** Perfil novo, derivado de um shell detectado, com nome único. */
export function newProfile(base: ShellProfile, taken: string[]): TermProfile {
  return {
    ...profileFromShell(base),
    id: crypto.randomUUID(),
    name: uniqueName(base.name, taken),
  };
}

/**
 * Nome único: "Projeto", "Projeto (2)", "Projeto (3)". Mesma regra de colisão
 * da suíte (LocalFiles 0.5.0): nunca substitui calado.
 */
export function uniqueName(base: string, taken: string[]): string {
  const b = base.trim() || "Perfil";
  if (!taken.includes(b)) return b;
  for (let n = 2; n < 10000; n++) {
    const cand = `${b} (${n})`;
    if (!taken.includes(cand)) return cand;
  }
  return `${b} (${Date.now()})`;
}

/**
 * Menu de "novo terminal": salvos primeiro (é o que o usuário montou), depois
 * os detectados que ainda não viraram perfil salvo.
 */
export function menuEntries(detected: ShellProfile[], saved: TermProfile[]): MenuEntry[] {
  const known = new Set(detected.map((d) => d.shell.toLowerCase()));
  const out: MenuEntry[] = saved.map((p) => ({
    id: p.id,
    name: p.name,
    saved: true,
    missing: !known.has(p.shell.toLowerCase()),
    profile: p,
  }));
  const usedIds = new Set(saved.map((p) => p.id));
  for (const d of detected) {
    if (usedIds.has(d.id)) continue;
    out.push({ id: d.id, name: d.name, saved: false, missing: false, profile: profileFromShell(d) });
  }
  return out;
}

/** Acha a entrada pedida; cai na primeira disponível se o id sumiu. */
export function pickEntry(entries: MenuEntry[], id: string | null): MenuEntry | undefined {
  return entries.find((e) => e.id === id) ?? entries[0];
}

export interface Appearance {
  fontFamily: string;
  fontSize: number;
  theme: string | null;
}

/**
 * Aparência efetiva da aba: o perfil sobrescreve as Configurações gerais campo
 * a campo. `null` significa "herda" — e é diferente de "vazio": um perfil com
 * `fontSize: 0` seria um bug, `null` é a ausência de opinião.
 */
export function appearanceOf(p: TermProfile, base: Appearance): Appearance {
  return {
    fontFamily: p.fontFamily ?? base.fontFamily,
    fontSize: p.fontSize ?? base.fontSize,
    theme: p.theme ?? base.theme,
  };
}

/**
 * Texto `KEY=VALUE` (uma por linha) → pares. É como o formulário edita o
 * ambiente: colar um `.env` tem que funcionar.
 *
 * O primeiro `=` separa; os demais ficam no VALOR (senão um
 * `DATABASE_URL=postgres://u:p@h/db?a=b` perderia o `?a=b`). Linha vazia e
 * comentário `#` são ignorados. `export FOO=bar` (formato de shell) é aceito.
 */
export function parseEnvText(text: string): EnvVar[] {
  const out: EnvVar[] = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("export ")) line = line.slice(7).trim();
    const i = line.indexOf("=");
    if (i <= 0) continue;
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    // Aspas em volta do valor inteiro são do formato, não do conteúdo.
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1);
    }
    if (key) out.push({ key, value });
  }
  return out;
}

/** Pares → texto do formulário (ida e volta com `parseEnvText`). */
export function envToText(env: EnvVar[]): string {
  return env.map((e) => `${e.key}=${e.value}`).join("\n");
}

/**
 * Resumo do ambiente pra mostrar na LISTA de perfis: só as chaves.
 *
 * Mesma regra do backend (`redact_env_for_log`): perfil é o lugar natural pra
 * guardar `GITHUB_TOKEN`, e a lista de perfis é a tela que fica aberta com
 * alguém olhando por cima do ombro. O valor só aparece no formulário de
 * edição, que o usuário abriu de propósito.
 */
export function envSummary(env: EnvVar[]): string {
  const keys = env.map((e) => e.key.trim()).filter(Boolean);
  return keys.join(", ");
}
