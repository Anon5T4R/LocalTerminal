/**
 * Esquemas de cor do TERMINAL (não do app).
 *
 * Por que existe um conceito separado do tema do app: o tema vive em CSS vars
 * no `<html data-theme>`, ou seja, é UM só pra janela inteira. Aparência por
 * perfil só faz sentido se duas abas puderem ter cores diferentes ao mesmo
 * tempo — então o que o perfil escolhe é o tema da INSTÂNCIA do xterm, que é
 * por objeto. `null`/`"inherit"` = segue o tema do app, que continua sendo o
 * padrão e o caminho de quem não mexe em perfil.
 */

export interface TermScheme {
  id: string;
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground: string;
}

export const TERM_SCHEMES: TermScheme[] = [
  {
    id: "classic",
    background: "#10151d",
    foreground: "#d4d4d4",
    cursor: "#d4d4d4",
    selectionBackground: "#264f78",
  },
  {
    id: "paper",
    background: "#fbfbf8",
    foreground: "#1e1e1e",
    cursor: "#1e1e1e",
    selectionBackground: "#add6ff",
  },
  {
    id: "solarized",
    background: "#002b36",
    foreground: "#93a1a1",
    cursor: "#93a1a1",
    selectionBackground: "#073642",
  },
  {
    id: "grape",
    background: "#282a36",
    foreground: "#f8f8f2",
    cursor: "#ff79c6",
    selectionBackground: "#44475a",
  },
  {
    id: "matrix",
    background: "#050b05",
    foreground: "#5ef07a",
    cursor: "#5ef07a",
    selectionBackground: "#144a1e",
  },
];

/** Esquema pelo id; `null` (herda do app) e id desconhecido dão `null`. */
export function schemeById(id: string | null | undefined): TermScheme | null {
  if (!id || id === "inherit") return null;
  return TERM_SCHEMES.find((s) => s.id === id) ?? null;
}

/** Fundo claro? Decide por luminância perceptual (0..255). */
export function isLightBg(hex: string): boolean {
  const h = hex.replace("#", "");
  if (h.length < 6) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}
