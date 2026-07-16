import { create } from "zustand";
import { clampFontSize } from "../lib/util";

export type Theme = "light" | "dark" | "system";

export interface Toast {
  id: number;
  kind: "info" | "error" | "ok";
  text: string;
}

interface UiState {
  theme: Theme;
  settingsOpen: boolean;
  fontSize: number;
  copyOnSelect: boolean;
  defaultProfile: string | null;
  toasts: Toast[];

  setTheme: (t: Theme) => void;
  setSettingsOpen: (v: boolean) => void;
  setFontSize: (v: number) => void;
  setCopyOnSelect: (v: boolean) => void;
  setDefaultProfile: (id: string) => void;
  pushToast: (kind: Toast["kind"], text: string) => void;
  dismissToast: (id: number) => void;
}

const THEME_KEY = "localterminal.theme";
const FONT_KEY = "localterminal.fontSize";
const COPYSEL_KEY = "localterminal.copyOnSelect";
const PROFILE_KEY = "localterminal.defaultProfile";

function loadTheme(): Theme {
  const v = localStorage.getItem(THEME_KEY);
  return v === "light" || v === "dark" || v === "system" ? v : "system";
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
  fontSize: clampFontSize(Number(localStorage.getItem(FONT_KEY)) || 13),
  copyOnSelect: localStorage.getItem(COPYSEL_KEY) === "1",
  defaultProfile: localStorage.getItem(PROFILE_KEY),
  toasts: [],

  setTheme: (theme) => {
    localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
    set({ theme });
  },
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setFontSize: (v) => {
    const fontSize = clampFontSize(v);
    localStorage.setItem(FONT_KEY, String(fontSize));
    set({ fontSize });
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
