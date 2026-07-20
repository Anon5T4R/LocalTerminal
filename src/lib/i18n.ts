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
  "top.profiles": "Perfis",
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
  "term.cwdMissing":
    "A pasta do perfil não existe mais ({dir}) — abrimos em {fallback}.",
  "term.envRejected":
    "Variáveis de ambiente recusadas (nome inválido): {keys}. O valor não é mostrado.",
  "term.openedHere": "Nova aba em {dir}",

  // Perfis
  "profiles.title": "Perfis",
  "profiles.manage": "Gerenciar perfis…",
  "profiles.saved": "Perfis salvos",
  "profiles.detected": "Shells detectados",
  "profiles.empty": "Nenhum perfil salvo ainda.",
  "profiles.pick": "Escolha um perfil à esquerda, ou crie um novo.",
  "profiles.add": "Novo",
  "profiles.duplicate": "Duplicar",
  "profiles.remove": "Remover",
  "profiles.name": "Nome",
  "profiles.shell": "Shell",
  "profiles.args": "Argumentos",
  "profiles.cwd": "Diretório inicial",
  "profiles.cwdPlaceholder": "vazio = pasta do usuário",
  "profiles.env": "Variáveis de ambiente",
  "profiles.envHelp":
    "Uma por linha, no formato NOME=valor (dá pra colar um .env). Os valores ficam só neste computador e nunca aparecem em log.",
  "profiles.font": "Fonte",
  "profiles.fontSize": "Tamanho da fonte",
  "profiles.scheme": "Cores do terminal",
  "profiles.inherit": "Herdar das Configurações",
  "profiles.notInstalled": "não encontrado nesta máquina",
  "profiles.shellMissing": "O shell {shell} não foi encontrado nesta máquina.",
  "profiles.saveFailed": "Não foi possível salvar os perfis: {error}",

  // Esquemas de cor do terminal
  "scheme.classic": "Clássico",
  "scheme.paper": "Papel",
  "scheme.solarized": "Solarizado",
  "scheme.grape": "Uva",
  "scheme.matrix": "Matrix",

  // Quake mode
  "quake.title": "Quake mode",
  "quake.help":
    "Um terminal desce do topo da tela com um atalho global e some com o mesmo atalho, sempre por cima das outras janelas.",
  "quake.enable": "Ligar o quake mode",
  "quake.shortcut": "Atalho global",
  "quake.height": "Altura",
  "quake.width": "Largura",
  "quake.profile": "Perfil do quake",
  "quake.profileDefault": "Usar o perfil padrão",
  "quake.saved": "Atalho registrado.",
  "quake.busy":
    "O sistema recusou \"{accel}\" — provavelmente já é atalho de outro app. Escolha outra combinação.",
  "quake.bootBusy":
    "O atalho do quake mode (\"{accel}\") não pôde ser registrado — outro app já usa essa combinação.",
  "quake.fixIt": "Trocar o atalho",
  "quake.escHint": "Esc esconde",

  // Bandeja e autostart
  "tray.title": "Bandeja e início com o sistema",
  "tray.help":
    "Com o app na bandeja, o atalho do quake mode responde sem a janela estar aberta.",
  "tray.autostart": "Abrir com o sistema (direto na bandeja)",
  "tray.closeToTray": "Fechar a janela envia para a bandeja em vez de sair",
  "tray.failed": "Não foi possível gravar no sistema: {err}",

  // Toasts
  "toast.copied": "Copiado",

  // Settings
  "settings.title": "Configurações",
  "settings.theme": "Tema",
  "settings.themeSystem": "Sistema",
  "settings.themeLight": "Claro",
  "settings.themeDark": "Escuro",
  "settings.themeNature": "Natureza",
  "settings.themeDarkBlue": "Azul escuro",
  "settings.themeCalmGreen": "Verde calmo",
  "settings.themePastelPink": "Rosa pastel",
  "settings.themePunkPrincess": "PunkPrincess",
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
    " — terminal 100% offline (ConPTY/PTY nativo + xterm.js, motor portado do LocalCode). Abas, painel dividido, perfis salvos (shell + diretório + variáveis + aparência), quake mode por atalho global, busca e tema. Parte da suíte Local.",
  "dlg.ok": "OK",
} as const;

export type MessageKey = keyof typeof pt;

const en: Record<MessageKey, string> = {
  "tabs.new": "New terminal (Ctrl+Shift+T)",
  "tabs.newWith": "New terminal with…",
  "tabs.close": "Close tab (Ctrl+Shift+W)",
  "top.search": "Search in terminal (Ctrl+Shift+F)",
  "top.split": "Split pane (Ctrl+Shift+D)",
  "top.profiles": "Profiles",
  "top.settingsTitle": "Settings",

  "search.placeholder": "Search…",
  "search.prev": "Previous (Shift+Enter)",
  "search.next": "Next (Enter)",
  "search.close": "Close (Esc)",

  "term.exited": "Process exited",
  "term.spawnError": "Failed to start the shell: {error}",
  "term.noShells": "No shell detected.",
  "term.cwdMissing": "The profile folder no longer exists ({dir}) — opened in {fallback}.",
  "term.envRejected":
    "Environment variables rejected (invalid name): {keys}. The value is not shown.",
  "term.openedHere": "New tab in {dir}",

  "profiles.title": "Profiles",
  "profiles.manage": "Manage profiles…",
  "profiles.saved": "Saved profiles",
  "profiles.detected": "Detected shells",
  "profiles.empty": "No saved profile yet.",
  "profiles.pick": "Pick a profile on the left, or create a new one.",
  "profiles.add": "New",
  "profiles.duplicate": "Duplicate",
  "profiles.remove": "Remove",
  "profiles.name": "Name",
  "profiles.shell": "Shell",
  "profiles.args": "Arguments",
  "profiles.cwd": "Starting directory",
  "profiles.cwdPlaceholder": "empty = user folder",
  "profiles.env": "Environment variables",
  "profiles.envHelp":
    "One per line, as NAME=value (you can paste a .env). Values stay on this computer and never appear in logs.",
  "profiles.font": "Font",
  "profiles.fontSize": "Font size",
  "profiles.scheme": "Terminal colors",
  "profiles.inherit": "Inherit from Settings",
  "profiles.notInstalled": "not found on this machine",
  "profiles.shellMissing": "The shell {shell} was not found on this machine.",
  "profiles.saveFailed": "Could not save the profiles: {error}",

  "scheme.classic": "Classic",
  "scheme.paper": "Paper",
  "scheme.solarized": "Solarized",
  "scheme.grape": "Grape",
  "scheme.matrix": "Matrix",

  "quake.title": "Quake mode",
  "quake.help":
    "A terminal slides down from the top of the screen with a global shortcut and hides with the same shortcut, always on top of other windows.",
  "quake.enable": "Enable quake mode",
  "quake.shortcut": "Global shortcut",
  "quake.height": "Height",
  "quake.width": "Width",
  "quake.profile": "Quake profile",
  "quake.profileDefault": "Use the default profile",
  "quake.saved": "Shortcut registered.",
  "quake.busy":
    "The system refused \"{accel}\" — another app probably owns it. Pick another combination.",
  "quake.bootBusy":
    "The quake mode shortcut (\"{accel}\") could not be registered — another app already uses that combination.",
  "quake.fixIt": "Change the shortcut",
  "quake.escHint": "Esc hides",

  "tray.title": "Tray and start with the system",
  "tray.help":
    "With the app in the tray, the quake mode shortcut works without the window being open.",
  "tray.autostart": "Start with the system (straight to the tray)",
  "tray.closeToTray": "Closing the window sends it to the tray instead of quitting",
  "tray.failed": "Could not write to the system: {err}",

  "toast.copied": "Copied",

  "settings.title": "Settings",
  "settings.theme": "Theme",
  "settings.themeSystem": "System",
  "settings.themeLight": "Light",
  "settings.themeDark": "Dark",
  "settings.themeNature": "Nature",
  "settings.themeDarkBlue": "Dark blue",
  "settings.themeCalmGreen": "Calm green",
  "settings.themePastelPink": "Pastel pink",
  "settings.themePunkPrincess": "PunkPrincess",
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
    " — 100% offline terminal (native ConPTY/PTY + xterm.js, engine ported from LocalCode). Tabs, split pane, saved profiles (shell + directory + variables + appearance), quake mode via global shortcut, search and themes. Part of the Local suite.",
  "dlg.ok": "OK",
};

const es: Record<MessageKey, string> = {
  "tabs.new": "Nueva terminal (Ctrl+Shift+T)",
  "tabs.newWith": "Nueva terminal con…",
  "tabs.close": "Cerrar pestaña (Ctrl+Shift+W)",
  "top.search": "Buscar en la terminal (Ctrl+Shift+F)",
  "top.split": "Dividir panel (Ctrl+Shift+D)",
  "top.profiles": "Perfiles",
  "top.settingsTitle": "Configuración",

  "search.placeholder": "Buscar…",
  "search.prev": "Anterior (Shift+Enter)",
  "search.next": "Siguiente (Enter)",
  "search.close": "Cerrar (Esc)",

  "term.exited": "Proceso terminado",
  "term.spawnError": "Error al iniciar el shell: {error}",
  "term.noShells": "Ningún shell detectado.",
  "term.cwdMissing": "La carpeta del perfil ya no existe ({dir}) — abrimos en {fallback}.",
  "term.envRejected":
    "Variables de entorno rechazadas (nombre inválido): {keys}. El valor no se muestra.",
  "term.openedHere": "Nueva pestaña en {dir}",

  "profiles.title": "Perfiles",
  "profiles.manage": "Administrar perfiles…",
  "profiles.saved": "Perfiles guardados",
  "profiles.detected": "Shells detectados",
  "profiles.empty": "Todavía no hay perfiles guardados.",
  "profiles.pick": "Elige un perfil a la izquierda, o crea uno nuevo.",
  "profiles.add": "Nuevo",
  "profiles.duplicate": "Duplicar",
  "profiles.remove": "Eliminar",
  "profiles.name": "Nombre",
  "profiles.shell": "Shell",
  "profiles.args": "Argumentos",
  "profiles.cwd": "Directorio inicial",
  "profiles.cwdPlaceholder": "vacío = carpeta del usuario",
  "profiles.env": "Variables de entorno",
  "profiles.envHelp":
    "Una por línea, con el formato NOMBRE=valor (puedes pegar un .env). Los valores se quedan en este equipo y nunca aparecen en el registro.",
  "profiles.font": "Fuente",
  "profiles.fontSize": "Tamaño de fuente",
  "profiles.scheme": "Colores de la terminal",
  "profiles.inherit": "Heredar de la Configuración",
  "profiles.notInstalled": "no encontrado en este equipo",
  "profiles.shellMissing": "No se encontró el shell {shell} en este equipo.",
  "profiles.saveFailed": "No se pudieron guardar los perfiles: {error}",

  "scheme.classic": "Clásico",
  "scheme.paper": "Papel",
  "scheme.solarized": "Solarizado",
  "scheme.grape": "Uva",
  "scheme.matrix": "Matrix",

  "quake.title": "Modo quake",
  "quake.help":
    "Una terminal baja desde la parte superior de la pantalla con un atajo global y se oculta con el mismo atajo, siempre por encima de las demás ventanas.",
  "quake.enable": "Activar el modo quake",
  "quake.shortcut": "Atajo global",
  "quake.height": "Altura",
  "quake.width": "Ancho",
  "quake.profile": "Perfil del quake",
  "quake.profileDefault": "Usar el perfil predeterminado",
  "quake.saved": "Atajo registrado.",
  "quake.busy":
    "El sistema rechazó \"{accel}\" — probablemente ya es atajo de otra app. Elige otra combinación.",
  "quake.bootBusy":
    "No se pudo registrar el atajo del modo quake (\"{accel}\") — otra app ya usa esa combinación.",
  "quake.fixIt": "Cambiar el atajo",
  "quake.escHint": "Esc oculta",

  "tray.title": "Bandeja e inicio con el sistema",
  "tray.help":
    "Con la app en la bandeja, el atajo del modo quake responde sin que la ventana esté abierta.",
  "tray.autostart": "Iniciar con el sistema (directo a la bandeja)",
  "tray.closeToTray": "Cerrar la ventana la envía a la bandeja en vez de salir",
  "tray.failed": "No se pudo escribir en el sistema: {err}",

  "toast.copied": "Copiado",

  "settings.title": "Configuración",
  "settings.theme": "Tema",
  "settings.themeSystem": "Sistema",
  "settings.themeLight": "Claro",
  "settings.themeDark": "Oscuro",
  "settings.themeNature": "Naturaleza",
  "settings.themeDarkBlue": "Azul oscuro",
  "settings.themeCalmGreen": "Verde tranquilo",
  "settings.themePastelPink": "Rosa pastel",
  "settings.themePunkPrincess": "PunkPrincess",
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
    " — terminal 100% offline (ConPTY/PTY nativo + xterm.js, motor portado del LocalCode). Pestañas, panel dividido, perfiles guardados (shell + directorio + variables + apariencia), modo quake por atajo global, búsqueda y temas. Parte de la suite Local.",
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
