/**
 * Janela do quake mode: um terminal só, colado no topo da tela.
 *
 * É uma SEGUNDA página (`quake.html`, segunda entrada do Vite) e não um modo da
 * página principal, porque o Tauri liga uma janela a uma URL — e a janela
 * precisa de `decorations: false` + `alwaysOnTop` + `skipTaskbar`, que a
 * principal não pode ter.
 *
 * Consequência que moldou o arquivo: **webview separado = heap JS separado**.
 * O store do app principal NÃO chega aqui; o que é compartilhado passa por
 * disco (`quake.json`, `profiles.json`, via comandos) ou por evento do Rust.
 * O tema é a exceção barata: vive em `localStorage`, que é por ORIGEM, e as
 * duas janelas estão na mesma.
 */

import { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import "./App.css";
import "./quake.css";
import {
  isTauri,
  listShells,
  onQuakeShown,
  profilesGet,
  quakeConfig,
  quakeHide,
} from "./lib/backend";
import { t, useLocale } from "./lib/i18n";
import { menuEntries, pickEntry, type TermProfile } from "./lib/profiles";
import TermInstance, { type TermControls } from "./components/TermInstance";
import { applyTheme, useUi } from "./state/ui";

function Quake() {
  const [profile, setProfile] = useState<TermProfile | null>(null);
  const [shown, setShown] = useState(false);
  const [warn, setWarn] = useState<string | null>(null);
  // Ref além do state: o listener monta uma vez e não veria o state novo.
  const shownRef = useRef(false);
  const ctlRef = useRef<TermControls | null>(null);

  useEffect(() => {
    if (!isTauri) return;
    void (async () => {
      const [shells, saved, cfg] = await Promise.all([
        listShells(),
        profilesGet().catch(() => [] as TermProfile[]),
        quakeConfig(),
      ]);
      const entry = pickEntry(menuEntries(shells, saved), cfg.profileId);
      if (entry) setProfile(entry.profile);
    })();
  }, []);

  // O terminal só NASCE quando a janela aparece pela 1ª vez: montar o PTY no
  // boot deixaria um shell rodando pra sempre em quem nunca usa o quake. Uma
  // vez montado ele NUNCA é desmontado — esconder a janela não pode matar o
  // shell, senão o quake perderia o histórico a cada toque de tecla.
  useEffect(() => {
    if (!isTauri || shownRef.current) return;
    const a = onQuakeShown(() => {
      shownRef.current = true;
      setShown(true);
    });
    return () => void a.then((f) => f()).catch(() => {});
  }, []);

  /**
   * Teclas da janela do quake.
   *
   * Copiar/colar PRECISA estar aqui: o `TermInstance` devolve `false` no
   * `attachCustomKeyEventHandler` para os combos do app (Ctrl+Shift+C/V entre
   * eles), contando que a janela trate. Na principal o `App.tsx` trata; aqui,
   * sem este handler, o xterm ignorava a tecla e ninguém a pegava — o combo
   * sumia no vazio e só o menu do botão direito funcionava.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        void quakeHide().catch(() => {});
        return;
      }
      if (e.ctrlKey && e.shiftKey && e.key.toUpperCase() === "C") {
        e.preventDefault();
        ctlRef.current?.copy();
        return;
      }
      if (e.ctrlKey && e.shiftKey && e.key.toUpperCase() === "V") {
        e.preventDefault();
        ctlRef.current?.paste();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={`quake ${shown ? "open" : ""}`}>
      <div className="quake-bar" data-tauri-drag-region>
        <span className="quake-title">{profile?.name ?? "LocalTerminal"}</span>
        <span className="muted small">{t("quake.escHint")}</span>
      </div>
      {warn && <div className="banner err">{warn}</div>}
      <div className="quake-body">
        {profile && shown && (
          <TermInstance
            active
            profile={profile}
            onExit={() => void quakeHide().catch(() => {})}
            onReady={(c) => (ctlRef.current = c)}
            onWarn={setWarn}
          />
        )}
        {!profile && <div className="muted small quake-empty">{t("term.noShells")}</div>}
      </div>
    </div>
  );
}

applyTheme(useUi.getState().theme);
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (useUi.getState().theme === "system") applyTheme("system");
});

function Root() {
  const locale = useLocale();
  return <Quake key={locale} />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<Root />);
