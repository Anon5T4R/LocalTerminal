import { useEffect, useRef, useState } from "react";
import { isTauri, listShells, type ShellProfile } from "./lib/backend";
import { t } from "./lib/i18n";
import { nextOrdinal, tabTitle } from "./lib/util";
import SettingsModal from "./components/SettingsModal";
import TermInstance, { type TermControls } from "./components/TermInstance";
import Toasts from "./components/Toasts";
import { useUi } from "./state/ui";

interface Pane {
  key: string;
  profileId: string;
}
interface Tab {
  key: string;
  profileId: string;
  title: string;
  /** 1 ou 2 painéis; 2 = dividido (lado a lado). */
  panes: Pane[];
}

export default function App() {
  const [profiles, setProfiles] = useState<ShellProfile[]>([]);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeKey, setActiveKey] = useState<string>("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const controlsRef = useRef(new Map<string, TermControls>());
  const focusedPaneRef = useRef<string>("");
  const searchRef = useRef<HTMLInputElement>(null);
  const setSettingsOpen = useUi((s) => s.setSettingsOpen);

  const profileOf = (id: string) => profiles.find((p) => p.id === id) ?? profiles[0];
  const activeTab = () => tabs.find((t) => t.key === activeKey);

  const openTab = (profileId?: string) => {
    setTabs((ts) => {
      const ui = useUi.getState();
      const pid = profileId ?? ui.defaultProfile ?? (profiles[0]?.id as string | undefined) ?? "";
      if (!pid) return ts;
      const prof = profiles.find((p) => p.id === pid) ?? profiles[0];
      const key = crypto.randomUUID();
      const paneKey = crypto.randomUUID();
      focusedPaneRef.current = paneKey;
      setActiveKey(key);
      return [
        ...ts,
        { key, profileId: prof.id, title: tabTitle(prof.name, nextOrdinal(ts, prof.id)), panes: [{ key: paneKey, profileId: prof.id }] },
      ];
    });
    setMenuOpen(false);
  };

  /** Divide a aba ativa em 2 painéis (mesmo perfil). */
  const splitActive = () => {
    setTabs((ts) =>
      ts.map((tb) => {
        if (tb.key !== activeKey || tb.panes.length >= 2) return tb;
        const paneKey = crypto.randomUUID();
        focusedPaneRef.current = paneKey;
        return { ...tb, panes: [...tb.panes, { key: paneKey, profileId: tb.profileId }] };
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
    void listShells().then(setProfiles);
  }, []);

  // Primeira aba quando os perfis chegam; sem aba depois disso = fecha o app.
  const everOpenedRef = useRef(false);
  useEffect(() => {
    if (profiles.length === 0) return;
    if (tabs.length === 0) {
      if (!everOpenedRef.current) {
        everOpenedRef.current = true;
        openTab();
      } else if (isTauri) {
        void import("@tauri-apps/api/window").then((m) => m.getCurrentWindow().close());
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles, tabs]);

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

  return (
    <div className="app">
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
                {profiles.length === 0 && <div className="muted">{t("term.noShells")}</div>}
                {profiles.map((p) => (
                  <button key={p.id} className="menu-item" onClick={() => openTab(p.id)}>
                    {p.name}
                  </button>
                ))}
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
            {tab.panes.map((pane) => {
              const prof = profileOf(pane.profileId);
              return prof ? (
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
                    profile={prof}
                    onExit={() => closePane(tab.key, pane.key)}
                    onReady={(c) => controlsRef.current.set(pane.key, c)}
                  />
                </div>
              ) : null;
            })}
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

      <SettingsModal profiles={profiles} />
      <Toasts />
    </div>
  );
}
