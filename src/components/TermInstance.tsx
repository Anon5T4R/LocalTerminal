import { useEffect, useRef, useState } from "react";
import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  killTerminal,
  onTerminalExit,
  onTerminalOutput,
  resizeTerminal,
  spawnTerminal,
  writeTerminal,
} from "../lib/backend";
import { t } from "../lib/i18n";
import { appearanceOf, type TermProfile } from "../lib/profiles";
import { isLightBg, schemeById } from "../lib/schemes";
import { useUi } from "../state/ui";

/** Controles que a instância expõe pro App (busca/foco/clipboard). */
export interface TermControls {
  findNext: (q: string) => void;
  findPrev: (q: string) => void;
  clearSearch: () => void;
  focus: () => void;
  copy: () => void;
  paste: () => void;
}

interface Props {
  active: boolean;
  profile: TermProfile;
  /** Diretório desta aba (o "abrir aqui" ganha do `cwd` do perfil). */
  cwd?: string | null;
  onExit: () => void;
  onReady: (controls: TermControls) => void;
  /** Desvio do que foi pedido (pasta sumida, variável recusada). */
  onWarn?: (text: string) => void;
}

/** Combos reservados pro app (xterm não engole; o window handler cuida). */
function isAppCombo(e: KeyboardEvent): boolean {
  if (e.ctrlKey && e.shiftKey && ["T", "W", "F", "D", "C", "V"].includes(e.key.toUpperCase()))
    return true;
  if (e.ctrlKey && e.key === "Tab") return true;
  if (e.ctrlKey && ["=", "+", "-"].includes(e.key)) return true;
  return false;
}

/**
 * Um terminal xterm ligado a um PTY (porte do LocalCode). A instância fica
 * montada mesmo fora da aba ativa (processo continua vivo).
 */
export default function TermInstance({ active, profile, cwd, onExit, onReady, onWarn }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sessionRef = useRef<string | null>(null);
  const spawnedRef = useRef(false);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  const baseFontSize = useUi((s) => s.fontSize);
  const baseFontFamily = useUi((s) => s.fontFamily);
  // Perfil sobrescreve as Configurações campo a campo; `null` = herda.
  const { fontSize, fontFamily } = appearanceOf(profile, {
    fontFamily: baseFontFamily,
    fontSize: baseFontSize,
    theme: null,
  });
  const onWarnRef = useRef(onWarn);
  onWarnRef.current = onWarn;
  const copyOnSelect = useUi((s) => s.copyOnSelect);
  const copyOnSelectRef = useRef(copyOnSelect);
  copyOnSelectRef.current = copyOnSelect;
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  // Ações de clipboard/seleção — usadas pelos atalhos (via onReady) e pelo
  // menu de contexto. Referenciam os refs, então funcionam a qualquer momento.
  const doCopy = () => {
    const sel = termRef.current?.getSelection();
    if (sel) void navigator.clipboard.writeText(sel).catch(() => {});
  };
  const doPaste = async () => {
    try {
      const txt = await navigator.clipboard.readText();
      if (txt && sessionRef.current) await writeTerminal(sessionRef.current, txt);
    } catch {
      /* clipboard vazio/sem permissão */
    }
    termRef.current?.focus();
  };
  const doSelectAll = () => termRef.current?.selectAll();
  const doClear = () => {
    termRef.current?.clear();
    termRef.current?.focus();
  };

  useEffect(() => {
    if (!containerRef.current || spawnedRef.current) return;
    spawnedRef.current = true;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: "block",
      fontSize: profile.fontSize ?? useUi.getState().fontSize,
      fontFamily: profile.fontFamily ?? useUi.getState().fontFamily,
      scrollback: 10000,
      theme: xtermTheme(profile.theme),
      allowProposedApi: true,
    });

    const fit = new FitAddon();
    const search = new SearchAddon();
    term.loadAddon(fit);
    term.loadAddon(search);
    term.loadAddon(
      new WebLinksAddon((_e, uri) => {
        void openUrl(uri).catch(() => {});
      }),
    );
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    term.attachCustomKeyEventHandler((e) => {
      if (e.type === "keydown" && isAppCombo(e)) return false;
      return true;
    });

    term.onSelectionChange(() => {
      if (!copyOnSelectRef.current) return;
      const sel = term.getSelection();
      if (sel) void navigator.clipboard.writeText(sel).catch(() => {});
    });

    // Segue o tema do app (data-theme muda → cores do xterm mudam junto).
    const themeObserver = new MutationObserver(() => {
      term.options.theme = xtermTheme(profile.theme);
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    const resizeObserver = new ResizeObserver(() => {
      fit.fit();
      const dims = fit.proposeDimensions();
      if (dims && sessionRef.current) {
        void resizeTerminal(sessionRef.current, dims.rows, dims.cols).catch(() => {});
      }
    });
    resizeObserver.observe(containerRef.current);

    let unOut: (() => void) | undefined;
    let unExit: (() => void) | undefined;

    // O "abrir aqui" (LocalFiles) ganha do diretório do perfil: o usuário
    // acabou de apontar a pasta, é o pedido mais recente.
    spawnTerminal(profile.shell, profile.args, cwd ?? profile.cwd ?? null, profile.env)
      .then(async (res) => {
        const id = res.sessionId;
        sessionRef.current = id;
        term.focus();
        // Desvios do que foi pedido. Antes o backend caía no HOME em silêncio.
        if (res.cwdFallback && res.requestedCwd) {
          onWarnRef.current?.(
            t("term.cwdMissing", { dir: res.requestedCwd, fallback: res.cwd ?? "" }),
          );
        }
        if (res.rejectedEnv.length > 0) {
          // Só as CHAVES — o valor pode ser um token.
          onWarnRef.current?.(t("term.envRejected", { keys: res.rejectedEnv.join(", ") }));
        }
        unOut = await onTerminalOutput(id, (data) => term.write(data));
        unExit = await onTerminalExit(id, () => {
          term.write(`\r\n\x1b[31m${t("term.exited")}\x1b[0m\r\n`);
          onExitRef.current();
        });
        term.onData((data) => {
          if (sessionRef.current) void writeTerminal(sessionRef.current, data).catch(() => {});
        });
        const dims = fit.proposeDimensions();
        if (dims) void resizeTerminal(id, dims.rows, dims.cols).catch(() => {});
      })
      .catch((e) => {
        term.write(`\r\n\x1b[31m${t("term.spawnError", { error: String(e) })}\x1b[0m\r\n`);
      });

    onReady({
      findNext: (q) => search.findNext(q, { incremental: false }),
      findPrev: (q) => search.findPrevious(q),
      clearSearch: () => search.clearDecorations(),
      focus: () => term.focus(),
      copy: doCopy,
      paste: doPaste,
    });

    return () => {
      themeObserver.disconnect();
      resizeObserver.disconnect();
      unOut?.();
      unExit?.();
      if (sessionRef.current) void killTerminal(sessionRef.current).catch(() => {});
      term.dispose();
      termRef.current = null;
      spawnedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fonte reativa às Configurações / Ctrl+= Ctrl+-.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontSize = fontSize;
    term.options.fontFamily = fontFamily;
    fitRef.current?.fit();
    const dims = fitRef.current?.proposeDimensions();
    if (dims && sessionRef.current) {
      void resizeTerminal(sessionRef.current, dims.rows, dims.cols).catch(() => {});
    }
  }, [fontSize, fontFamily]);

  // Refit + foco ao virar a aba ativa.
  useEffect(() => {
    if (!active) return;
    requestAnimationFrame(() => {
      fitRef.current?.fit();
      termRef.current?.focus();
      const dims = fitRef.current?.proposeDimensions();
      if (dims && sessionRef.current) {
        void resizeTerminal(sessionRef.current, dims.rows, dims.cols).catch(() => {});
      }
    });
  }, [active]);

  const menuItem = (label: string, fn: () => void, disabled = false) => (
    <button
      className="term-menu-item"
      disabled={disabled}
      onClick={() => {
        setMenu(null);
        fn();
      }}
    >
      {label}
    </button>
  );

  return (
    <>
      {/* O div do xterm não pode ter filhos React (o xterm gerencia o DOM dele). */}
      <div
        ref={containerRef}
        className="term-container"
        style={{ position: "absolute", inset: 0, display: active ? "block" : "none" }}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
      />
      {menu && active && (
        <>
          <div className="term-menu-backdrop" onMouseDown={() => setMenu(null)} />
          <div className="term-menu" style={{ left: menu.x, top: menu.y }}>
            {menuItem(t("menu.copy"), doCopy, !termRef.current?.hasSelection())}
            {menuItem(t("menu.paste"), () => void doPaste())}
            {menuItem(t("menu.selectAll"), doSelectAll)}
            {menuItem(t("menu.clear"), doClear)}
          </div>
        </>
      )}
    </>
  );
}

/** Conjunto ANSI (16 cores) para fundos claros — extraído do ramo light. */
const ANSI_LIGHT: Partial<ITheme> = {
  black: "#000000", red: "#cd3131", green: "#107c10", yellow: "#795e26",
  blue: "#0451a5", magenta: "#bc05bc", cyan: "#0598bc", white: "#555555",
  brightBlack: "#666666", brightRed: "#cd3131", brightGreen: "#14ce14",
  brightYellow: "#b5ba00", brightBlue: "#0451a5", brightMagenta: "#bc05bc",
  brightCyan: "#0598bc", brightWhite: "#000000",
};

/** Conjunto ANSI (16 cores) para fundos escuros — extraído do ramo dark. */
const ANSI_DARK: Partial<ITheme> = {
  black: "#000000", red: "#cd3131", green: "#0dbc79", yellow: "#e5e510",
  blue: "#2472c8", magenta: "#bc3fbc", cyan: "#11b8bd", white: "#e5e5e5",
  brightBlack: "#666666", brightRed: "#f14c4c", brightGreen: "#23d18b",
  brightYellow: "#f5f543", brightBlue: "#3b8eea", brightMagenta: "#d670d6",
  brightCyan: "#29b8db", brightWhite: "#e5e5e5",
};

/**
 * Tema do xterm. Sem esquema no perfil, deriva das CSS vars do app (o
 * comportamento de sempre); com esquema, usa as cores dele — é o que permite
 * duas abas com cores diferentes ao mesmo tempo. Em ambos os casos o conjunto
 * ANSI é escolhido pela luminância do fundo, senão um esquema claro herdaria
 * o vermelho brilhante do escuro e ficaria ilegível.
 */
function xtermTheme(schemeId: string | null): ITheme {
  const s = schemeById(schemeId);
  if (s) {
    return { ...s, ...(isLightBg(s.background) ? ANSI_LIGHT : ANSI_DARK) };
  }
  const cs = getComputedStyle(document.documentElement);
  const readVar = (name: string, fallback: string) =>
    cs.getPropertyValue(name).trim() || fallback;
  const bg = readVar("--term-bg", "#10151d");
  const light = isLightBg(bg);
  const fg = light ? "#1e1e1e" : "#d4d4d4";
  const cursor = readVar("--accent", fg);
  const selectionBackground = readVar("--sel-bg", light ? "#add6ff" : "#264f78");
  const ansi = light ? ANSI_LIGHT : ANSI_DARK;
  return { background: bg, foreground: fg, cursor, selectionBackground, ...ansi };
}
