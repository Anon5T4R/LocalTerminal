import { useSyncExternalStore } from "react";

/**
 * i18n leve da UI (padrão da suíte, ver docs/planos/padrao-apps.md). O dict
 * `pt` é a fonte da verdade das chaves; `en`/`es` como `Record<MessageKey,
 * string>` fazem o compilador recusar chave faltando ou sobrando.
 */

export type Locale = "pt" | "en" | "es";

export const LOCALE_LABELS: Record<Locale, string> = {
  pt: "Português",
  en: "English",
  es: "Español",
};

const LOCALE_KEY = "localterminal.locale";

const pt = {
  // Abas / topo
  "tabs.new": "Novo terminal (Ctrl+Shift+T)",
  "tabs.newWith": "Novo terminal com…",
  "tabs.close": "Fechar aba (Ctrl+Shift+W)",
  "top.search": "Buscar no terminal (Ctrl+Shift+F)",
  "top.split": "Dividir painel (Ctrl+Shift+D)",
  "top.settingsTitle": "Configurações",

  // Busca
  "search.placeholder": "Buscar…",
  "search.prev": "Anterior (Shift+Enter)",
  "search.next": "Próximo (Enter)",
  "search.close": "Fechar (Esc)",

  // Terminal
  "term.exited": "Processo encerrado",
  "term.spawnError": "Erro ao iniciar o shell: {error}",
  "term.noShells": "Nenhum shell detectado.",

  // Toasts
  "toast.copied": "Copiado",

  // Settings
  "settings.title": "Configurações",
  "settings.theme": "Tema",
  "settings.themeSystem": "Sistema",
  "settings.themeLight": "Claro",
  "settings.themeDark": "Escuro",
  "settings.language": "Idioma",
  "settings.defaultShell": "Shell padrão (novas abas)",
  "settings.fontSize": "Tamanho da fonte",
  "settings.fontFamily": "Fonte",
  "settings.copyOnSelect": "Copiar automaticamente ao selecionar",
  "menu.copy": "Copiar",
  "menu.paste": "Colar",
  "menu.selectAll": "Selecionar tudo",
  "menu.clear": "Limpar",
  "settings.shortcuts":
    "Atalhos: Ctrl+Shift+T nova aba · Ctrl+Shift+W fecha · Ctrl+Shift+D divide · Ctrl+Tab troca · Ctrl+Shift+C/V copia/cola · Ctrl+Shift+F busca · Ctrl+= / Ctrl+- zoom",
  "settings.about":
    " — terminal 100% offline (ConPTY/PTY nativo + xterm.js, motor portado do LocalCode). Abas, perfis de shell (PowerShell/cmd/Git Bash/WSL · bash/zsh/fish), busca e tema. Parte da suíte Local.",
  "dlg.ok": "OK",
} as const;

export type MessageKey = keyof typeof pt;

const en: Record<MessageKey, string> = {
  "tabs.new": "New terminal (Ctrl+Shift+T)",
  "tabs.newWith": "New terminal with…",
  "tabs.close": "Close tab (Ctrl+Shift+W)",
  "top.search": "Search in terminal (Ctrl+Shift+F)",
  "top.split": "Split pane (Ctrl+Shift+D)",
  "top.settingsTitle": "Settings",

  "search.placeholder": "Search…",
  "search.prev": "Previous (Shift+Enter)",
  "search.next": "Next (Enter)",
  "search.close": "Close (Esc)",

  "term.exited": "Process exited",
  "term.spawnError": "Failed to start the shell: {error}",
  "term.noShells": "No shell detected.",

  "toast.copied": "Copied",

  "settings.title": "Settings",
  "settings.theme": "Theme",
  "settings.themeSystem": "System",
  "settings.themeLight": "Light",
  "settings.themeDark": "Dark",
  "settings.language": "Language",
  "settings.defaultShell": "Default shell (new tabs)",
  "settings.fontSize": "Font size",
  "settings.fontFamily": "Font",
  "settings.copyOnSelect": "Copy automatically on select",
  "menu.copy": "Copy",
  "menu.paste": "Paste",
  "menu.selectAll": "Select all",
  "menu.clear": "Clear",
  "settings.shortcuts":
    "Shortcuts: Ctrl+Shift+T new tab · Ctrl+Shift+W close · Ctrl+Shift+D split · Ctrl+Tab switch · Ctrl+Shift+C/V copy/paste · Ctrl+Shift+F search · Ctrl+= / Ctrl+- zoom",
  "settings.about":
    " — 100% offline terminal (native ConPTY/PTY + xterm.js, engine ported from LocalCode). Tabs, shell profiles (PowerShell/cmd/Git Bash/WSL · bash/zsh/fish), search and themes. Part of the Local suite.",
  "dlg.ok": "OK",
};

const es: Record<MessageKey, string> = {
  "tabs.new": "Nueva terminal (Ctrl+Shift+T)",
  "tabs.newWith": "Nueva terminal con…",
  "tabs.close": "Cerrar pestaña (Ctrl+Shift+W)",
  "top.search": "Buscar en la terminal (Ctrl+Shift+F)",
  "top.split": "Dividir panel (Ctrl+Shift+D)",
  "top.settingsTitle": "Configuración",

  "search.placeholder": "Buscar…",
  "search.prev": "Anterior (Shift+Enter)",
  "search.next": "Siguiente (Enter)",
  "search.close": "Cerrar (Esc)",

  "term.exited": "Proceso terminado",
  "term.spawnError": "Error al iniciar el shell: {error}",
  "term.noShells": "Ningún shell detectado.",

  "toast.copied": "Copiado",

  "settings.title": "Configuración",
  "settings.theme": "Tema",
  "settings.themeSystem": "Sistema",
  "settings.themeLight": "Claro",
  "settings.themeDark": "Oscuro",
  "settings.language": "Idioma",
  "settings.defaultShell": "Shell predeterminado (pestañas nuevas)",
  "settings.fontSize": "Tamaño de fuente",
  "settings.fontFamily": "Fuente",
  "settings.copyOnSelect": "Copiar automáticamente al seleccionar",
  "menu.copy": "Copiar",
  "menu.paste": "Pegar",
  "menu.selectAll": "Seleccionar todo",
  "menu.clear": "Limpiar",
  "settings.shortcuts":
    "Atajos: Ctrl+Shift+T nueva pestaña · Ctrl+Shift+W cierra · Ctrl+Shift+D divide · Ctrl+Tab cambia · Ctrl+Shift+C/V copia/pega · Ctrl+Shift+F busca · Ctrl+= / Ctrl+- zoom",
  "settings.about":
    " — terminal 100% offline (ConPTY/PTY nativo + xterm.js, motor portado del LocalCode). Pestañas, perfiles de shell (PowerShell/cmd/Git Bash/WSL · bash/zsh/fish), búsqueda y temas. Parte de la suite Local.",
  "dlg.ok": "OK",
};

const DICTS: Record<Locale, Record<MessageKey, string>> = { pt, en, es };

/** Palpite de locale pelo idioma do sistema (só no 1º uso). */
export function detectLocale(): Locale {
  const l = (typeof navigator !== "undefined" ? navigator.language : "pt").toLowerCase();
  if (l.startsWith("en")) return "en";
  if (l.startsWith("es")) return "es";
  return "pt";
}

function loadLocale(): Locale {
  const v = typeof localStorage !== "undefined" ? localStorage.getItem(LOCALE_KEY) : null;
  return v === "pt" || v === "en" || v === "es" ? v : detectLocale();
}

let current: Locale = loadLocale();
const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale) {
  if (locale === current) return;
  current = locale;
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    /* localStorage indisponível */
  }
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale);
}

/** Traduz uma chave, interpolando placeholders `{param}`. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  let msg: string = DICTS[current][key] ?? pt[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      msg = msg.split(`{${k}}`).join(String(v));
    }
  }
  return msg;
}
