import { useEffect, useRef, useState } from "react";
import {
  isTauri,
  listShells,
  onOpenCwd,
  onQuakeShortcutFailed,
  profilesGet,
  startupCwd,
  type ShellProfile,
} from "./lib/backend";
import { t } from "./lib/i18n";
import { menuEntries, pickEntry, type MenuEntry, type TermProfile } from "./lib/profiles";
import { nextOrdinal, tabTitle } from "./lib/util";
import ProfilesModal from "./components/ProfilesModal";
import SettingsModal from "./components/SettingsModal";
import TermInstance, { type TermControls } from "./components/TermInstance";
import Toasts from "./components/Toasts";
import { useUi } from "./state/ui";

interface Pane {
  key: string;
  profile: TermProfile;
  /** Diretório pedido na abertura ("abrir aqui"); ganha do cwd do perfil. */
  cwd: string | null;
}
interface Tab {
  key: string;
  profileId: string;
  title: string;
  /** 1 ou 2 painéis; 2 = dividido (lado a lado). */
  panes: Pane[];
}

export default function App() {
  const [shells, setShells] = useState<ShellProfile[]>([]);
  const [saved, setSaved] = useState<TermProfile[]>([]);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeKey, setActiveKey] = useState<string>("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [shortcutFailed, setShortcutFailed] = useState<string | null>(null);
  const controlsRef = useRef(new Map<string, TermControls>());
  const focusedPaneRef = useRef<string>("");
  const searchRef = useRef<HTMLInputElement>(null);
  const setSettingsOpen = useUi((s) => s.setSettingsOpen);
  const setProfilesOpen = useUi((s) => s.setProfilesOpen);
  const pushToast = useUi((s) => s.pushToast);

  const entries = menuEntries(shells, saved);
  // Ref pra os handlers (atalho, evento de "abrir aqui") verem a lista atual
  // sem virar dependência de effect e re-registrar listener a cada render.
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  const activeTab = () => tabs.find((t) => t.key === activeKey);

  const openTab = (entryId?: string, cwd?: string | null) => {
    const list = entriesRef.current;
    const ui = useUi.getState();
    const entry = pickEntry(list, entryId ?? ui.defaultProfile);
    if (!entry) return;
    const key = crypto.randomUUID();
    const paneKey = crypto.randomUUID();
    focusedPaneRef.current = paneKey;
    setTabs((ts) => [
      ...ts,
      {
        key,
        profileId: entry.id,
        title: tabTitle(entry.name, nextOrdinal(ts, entry.id)),
        panes: [{ key: paneKey, profile: entry.profile, cwd: cwd ?? null }],
      },
    ]);
    setActiveKey(key);
    setMenuOpen(false);
  };

  /** Divide a aba ativa em 2 painéis (mesmo perfil, mesmo diretório). */
  const splitActive = () => {
    setTabs((ts) =>
      ts.map((tb) => {
        if (tb.key !== activeKey || tb.panes.length >= 2) return tb;
        const paneKey = crypto.randomUUID();
        focusedPaneRef.current = paneKey;
        const src = tb.panes[0];
        return { ...tb, panes: [...tb.panes, { key: paneKey, profile: src.profile, cwd: src.cwd }] };
      }),
    );
  };

  const closePane = (tabKey: string, paneKey: string) => {
    controlsRef.current.delete(paneKey);
    setTabs((ts) =>
      ts.flatMap((tb) => {
        if (tb.key !== tabKey) return [tb];
        const panes = tb.panes.filter((p) => p.key !== paneKey);
        return panes.length === 0 ? [] : [{ ...tb, panes }];
      }),
    );
  };

  const closeTab = (key: string) => {
    const tb = tabs.find((x) => x.key === key);
    tb?.panes.forEach((p) => controlsRef.current.delete(p.key));
    setTabs((ts) => ts.filter((x) => x.key !== key));
  };

  useEffect(() => {
    if (!isTauri) return;
    void listShells().then(setShells);
    void profilesGet().then(setSaved).catch(() => {});
  }, []);

  // "Abrir aqui" com o app JÁ aberto (2ª instância) — o caso comum.
  useEffect(() => {
    if (!isTauri) return;
    const un = onOpenCwd((dir) => {
      openTab(undefined, dir);
      pushToast("info", t("term.openedHere", { dir }));
    });
    return () => void un.then((f) => f()).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // O atalho global não registrou no boot. Isso PRECISA aparecer: o atalho é a
  // única porta do quake mode, e falhar calado entrega um recurso morto.
  useEffect(() => {
    if (!isTauri) return;
    const un = onQuakeShortcutFailed(setShortcutFailed);
    return () => void un.then((f) => f()).catch(() => {});
  }, []);

  // Primeira aba quando os shells chegam; sem aba depois disso = fecha o app.
  const everOpenedRef = useRef(false);
  useEffect(() => {
    if (entries.length === 0) return;
    if (tabs.length === 0) {
      if (!everOpenedRef.current) {
        everOpenedRef.current = true;
        // Arranque com `--cwd` (LocalFiles com o terminal fechado): a 1ª aba
        // já nasce na pasta pedida, em vez de abrir no HOME e depois pular.
        if (isTauri) {
          void startupCwd()
            .then((dir) => openTab(undefined, dir))
            .catch(() => openTab());
        } else {
          openTab();
        }
      } else if (isTauri) {
        void import("@tauri-apps/api/window").then((m) => m.getCurrentWindow().close());
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.length, tabs]);

  useEffect(() => {
    if (tabs.length > 0 && !tabs.some((x) => x.key === activeKey)) {
      setActiveKey(tabs[tabs.length - 1].key);
    }
  }, [tabs, activeKey]);

  const focusedControls = () =>
    controlsRef.current.get(focusedPaneRef.current) ??
    controlsRef.current.get(activeTab()?.panes[0].key ?? "");

  useEffect(() => {
    if (searchOpen) {
      searchRef.current?.focus();
      searchRef.current?.select();
    } else {
      setQuery("");
      focusedControls()?.clearSearch();
      focusedControls()?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ui = useUi.getState();
      if (e.ctrlKey && e.shiftKey && e.key.toUpperCase() === "T") {
        e.preventDefault();
        openTab();
        return;
      }
      if (e.ctrlKey && e.shiftKey && e.key.toUpperCase() === "W") {
        e.preventDefault();
        if (activeKey) closeTab(activeKey);
        return;
      }
      if (e.ctrlKey && e.shiftKey && e.key.toUpperCase() === "D") {
        e.preventDefault();
        splitActive();
        return;
      }
      if (e.ctrlKey && e.shiftKey && e.key.toUpperCase() === "F") {
        e.preventDefault();
        setSearchOpen((v) => !v);
        return;
      }
      if (e.ctrlKey && e.shiftKey && e.key.toUpperCase() === "C") {
        e.preventDefault();
        focusedControls()?.copy();
        return;
      }
      if (e.ctrlKey && e.shiftKey && e.key.toUpperCase() === "V") {
        e.preventDefault();
        focusedControls()?.paste();
        return;
      }
      if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        setTabs((ts) => {
          if (ts.length > 1) {
            const idx = ts.findIndex((x) => x.key === activeKey);
            const next = ts[(idx + (e.shiftKey ? ts.length - 1 : 1)) % ts.length];
            setActiveKey(next.key);
          }
          return ts;
        });
        return;
      }
      if (e.ctrlKey && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        ui.setFontSize(ui.fontSize + 1);
        return;
      }
      if (e.ctrlKey && e.key === "-") {
        e.preventDefault();
        ui.setFontSize(ui.fontSize - 1);
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  const doSearch = (backwards: boolean) => {
    const c = focusedControls();
    if (!c || !query) return;
    if (backwards) c.findPrev(query);
    else c.findNext(query);
  };

  const entryLabel = (e: MenuEntry) => (e.missing ? `${e.name} ⚠` : e.name);

  return (
    <div className="app">
      {shortcutFailed && (
        <div className="banner err">
          <span>{t("quake.bootBusy", { accel: shortcutFailed })}</span>
          <button
            onClick={() => {
              setShortcutFailed(null);
              setSettingsOpen(true);
            }}
          >
            {t("quake.fixIt")}
          </button>
          <button onClick={() => setShortcutFailed(null)}>✕</button>
        </div>
      )}

      <div className="topbar">
        <div className="tabs">
          {tabs.map((tab) => (
            <div
              key={tab.key}
              className={`tab ${tab.key === activeKey ? "active" : ""}`}
              onClick={() => setActiveKey(tab.key)}
              onAuxClick={(e) => {
                if (e.button === 1) closeTab(tab.key);
              }}
            >
              <span className="tab-label">
                {tab.title}
                {tab.panes.length > 1 && " ⬒"}
              </span>
              <button
                className="tab-close"
                title={t("tabs.close")}
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.key);
                }}
              >
                ×
              </button>
            </div>
          ))}
          <div className="newtab-wrap">
            <button className="tab-new" title={t("tabs.new")} onClick={() => openTab()}>
              +
            </button>
            <button
              className="tab-new-menu"
              title={t("tabs.newWith")}
              onClick={() => setMenuOpen((v) => !v)}
            >
              ▾
            </button>
            {menuOpen && (
              <div className="profile-menu" onMouseLeave={() => setMenuOpen(false)}>
                {entries.length === 0 && <div className="muted">{t("term.noShells")}</div>}
                {entries.some((e) => e.saved) && (
                  <div className="menu-head">{t("profiles.saved")}</div>
                )}
                {entries
                  .filter((e) => e.saved)
                  .map((e) => (
                    <button
                      key={e.id}
                      className="menu-item"
                      title={e.missing ? t("profiles.shellMissing", { shell: e.profile.shell }) : ""}
                      onClick={() => openTab(e.id)}
                    >
                      {entryLabel(e)}
                    </button>
                  ))}
                {entries.some((e) => !e.saved) && (
                  <div className="menu-head">{t("profiles.detected")}</div>
                )}
                {entries
                  .filter((e) => !e.saved)
                  .map((e) => (
                    <button key={e.id} className="menu-item" onClick={() => openTab(e.id)}>
                      {e.name}
                    </button>
                  ))}
                <div className="menu-sep" />
                <button
                  className="menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    setProfilesOpen(true);
                  }}
                >
                  {t("profiles.manage")}
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="topbar-actions">
          <button
            title={t("top.split")}
            disabled={(activeTab()?.panes.length ?? 0) >= 2}
            onClick={splitActive}
          >
            ⬒
          </button>
          <button title={t("top.search")} onClick={() => setSearchOpen((v) => !v)}>
            🔍
          </button>
          <button title={t("top.profiles")} onClick={() => setProfilesOpen(true)}>
            ▤
          </button>
          <button title={t("top.settingsTitle")} onClick={() => setSettingsOpen(true)}>
            ⚙
          </button>
        </div>
      </div>

      <div className="term-body">
        {tabs.map((tab) => (
          <div
            key={tab.key}
            className="pane-grid"
            style={{ display: tab.key === activeKey ? "flex" : "none" }}
          >
            {tab.panes.map((pane) => (
              <div
                key={pane.key}
                className="pane"
                onMouseDownCapture={() => (focusedPaneRef.current = pane.key)}
              >
                {tab.panes.length > 1 && (
                  <button
                    className="pane-close"
                    title={t("tabs.close")}
                    onClick={() => closePane(tab.key, pane.key)}
                  >
                    ×
                  </button>
                )}
                <TermInstance
                  active={tab.key === activeKey}
                  profile={pane.profile}
                  cwd={pane.cwd}
                  onExit={() => closePane(tab.key, pane.key)}
                  onReady={(c) => controlsRef.current.set(pane.key, c)}
                  onWarn={(text) => pushToast("error", text)}
                />
              </div>
            ))}
          </div>
        ))}

        {searchOpen && (
          <div className="search-overlay">
            <input
              ref={searchRef}
              value={query}
              placeholder={t("search.placeholder")}
              spellCheck={false}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") doSearch(e.shiftKey);
                if (e.key === "Escape") setSearchOpen(false);
              }}
            />
            <button title={t("search.prev")} onClick={() => doSearch(true)}>
              ↑
            </button>
            <button title={t("search.next")} onClick={() => doSearch(false)}>
              ↓
            </button>
            <button title={t("search.close")} onClick={() => setSearchOpen(false)}>
              ✕
            </button>
          </div>
        )}
      </div>

      <ProfilesModal shells={shells} profiles={saved} onChange={setSaved} />
      <SettingsModal entries={entries} />
      <Toasts />
    </div>
  );
}
