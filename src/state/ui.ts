import { create } from "zustand";
import { clampFontSize } from "../lib/util";

export type Theme =
  | "light"
  | "dark"
  | "system"
  | "nature"
  | "darkblue"
  | "calmgreen"
  | "pastelpink"
  | "punkprincess";

export const THEMES: Theme[] = [
  "system",
  "light",
  "dark",
  "nature",
  "darkblue",
  "calmgreen",
  "pastelpink",
  "punkprincess",
];

/** Fontes monoespaçadas oferecidas nas Configurações (fallbacks embutidos). */
export const FONT_FAMILIES: { id: string; label: string; value: string }[] = [
  { id: "cascadia", label: "Cascadia Code", value: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace" },
  { id: "fira", label: "Fira Code", value: "'Fira Code', 'Cascadia Code', Consolas, monospace" },
  { id: "jetbrains", label: "JetBrains Mono", value: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace" },
  { id: "consolas", label: "Consolas", value: "Consolas, 'Cascadia Mono', monospace" },
  { id: "system", label: "Monospace do sistema", value: "ui-monospace, SFMono-Regular, Menlo, monospace" },
];
const DEFAULT_FONT = FONT_FAMILIES[0].value;

export interface Toast {
  id: number;
  kind: "info" | "error" | "ok";
  text: string;
}

interface UiState {
  theme: Theme;
  settingsOpen: boolean;
  profilesOpen: boolean;
  fontSize: number;
  fontFamily: string;
  copyOnSelect: boolean;
  defaultProfile: string | null;
  toasts: Toast[];

  setTheme: (t: Theme) => void;
  setSettingsOpen: (v: boolean) => void;
  setProfilesOpen: (v: boolean) => void;
  setFontSize: (v: number) => void;
  setFontFamily: (v: string) => void;
  setCopyOnSelect: (v: boolean) => void;
  setDefaultProfile: (id: string) => void;
  pushToast: (kind: Toast["kind"], text: string) => void;
  dismissToast: (id: number) => void;
}

const THEME_KEY = "localterminal.theme";
const FONT_KEY = "localterminal.fontSize";
const FONTFAM_KEY = "localterminal.fontFamily";
const COPYSEL_KEY = "localterminal.copyOnSelect";
const PROFILE_KEY = "localterminal.defaultProfile";

function loadTheme(): Theme {
  const v = localStorage.getItem(THEME_KEY);
  return v && (THEMES as string[]).includes(v) ? (v as Theme) : "system";
}

/** Aplica o tema no <html data-theme> (resolvendo "system" pela mídia). */
export function applyTheme(theme: Theme) {
  const resolved =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;
  document.documentElement.dataset.theme = resolved;
}

let nextToast = 1;

export const useUi = create<UiState>((set) => ({
  theme: loadTheme(),
  settingsOpen: false,
  profilesOpen: false,
  fontSize: clampFontSize(Number(localStorage.getItem(FONT_KEY)) || 13),
  fontFamily: localStorage.getItem(FONTFAM_KEY) || DEFAULT_FONT,
  copyOnSelect: localStorage.getItem(COPYSEL_KEY) === "1",
  defaultProfile: localStorage.getItem(PROFILE_KEY),
  toasts: [],

  setTheme: (theme) => {
    localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
    set({ theme });
  },
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setProfilesOpen: (profilesOpen) => set({ profilesOpen }),
  setFontSize: (v) => {
    const fontSize = clampFontSize(v);
    localStorage.setItem(FONT_KEY, String(fontSize));
    set({ fontSize });
  },
  setFontFamily: (fontFamily) => {
    localStorage.setItem(FONTFAM_KEY, fontFamily);
    set({ fontFamily });
  },
  setCopyOnSelect: (copyOnSelect) => {
    localStorage.setItem(COPYSEL_KEY, copyOnSelect ? "1" : "0");
    set({ copyOnSelect });
  },
  setDefaultProfile: (id) => {
    localStorage.setItem(PROFILE_KEY, id);
    set({ defaultProfile: id });
  },
  pushToast: (kind, text) =>
    set((s) => ({ toasts: [...s.toasts, { id: nextToast++, kind, text }] })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
