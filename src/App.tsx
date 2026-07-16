import { useEffect, useRef, useState } from "react";
import { isTauri, listShells, type ShellProfile } from "./lib/backend";
import { t } from "./lib/i18n";
import { nextOrdinal, tabTitle } from "./lib/util";
import SettingsModal from "./components/SettingsModal";
import TermInstance, { type TermControls } from "./components/TermInstance";
import Toasts from "./components/Toasts";
import { useUi } from "./state/ui";

interface Tab {
  key: string;
  profileId: string;
  title: string;
}

export default function App() {
  const [profiles, setProfiles] = useState<ShellProfile[]>([]);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeKey, setActiveKey] = useState<string>("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const controlsRef = useRef(new Map<string, TermControls>());
  const searchRef = useRef<HTMLInputElement>(null);
  const setSettingsOpen = useUi((s) => s.setSettingsOpen);

  const profileOf = (id: string) => profiles.find((p) => p.id === id) ?? profiles[0];

  const openTab = (profileId?: string) => {
    setTabs((ts) => {
      const ui = useUi.getState();
      const pid =
        profileId ??
        ui.defaultProfile ??
        (profiles[0]?.id as string | undefined) ??
        "";
      if (!pid) return ts;
      const prof = profiles.find((p) => p.id === pid) ?? profiles[0];
      const key = crypto.randomUUID();
      const title = tabTitle(prof.name, nextOrdinal(ts, prof.id));
      setActiveKey(key);
      return [...ts, { key, profileId: prof.id, title }];
    });
    setMenuOpen(false);
  };

  const closeTab = (key: string) => {
    controlsRef.current.delete(key);
    setTabs((ts) => ts.filter((x) => x.key !== key));
  };

  // Boot: detecta shells e abre a 1ª aba.
  useEffect(() => {
    if (!isTauri) return;
    void listShells().then((list) => {
      setProfiles(list);
    });
  }, []);

  // Abre a primeira aba assim que os perfis chegam; depois disso, ficar sem
  // aba = fechar o app (comportamento de terminal).
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

  useEffect(() => {
    if (searchOpen) {
      searchRef.current?.focus();
      searchRef.current?.select();
    } else {
      setQuery("");
      controlsRef.current.get(activeKey)?.clearSearch();
      controlsRef.current.get(activeKey)?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchOpen]);

  // Atalhos globais (o xterm libera os combos reservados).
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
      if (e.ctrlKey && e.shiftKey && e.key.toUpperCase() === "F") {
        e.preventDefault();
        setSearchOpen((v) => !v);
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
    const c = controlsRef.current.get(activeKey);
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
              <span className="tab-label">{tab.title}</span>
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
          <button title={t("top.search")} onClick={() => setSearchOpen((v) => !v)}>
            🔍
          </button>
          <button title={t("top.settingsTitle")} onClick={() => setSettingsOpen(true)}>
            ⚙
          </button>
        </div>
      </div>

      <div className="term-body">
        {tabs.map((tab) => {
          const prof = profileOf(tab.profileId);
          return prof ? (
            <TermInstance
              key={tab.key}
              active={tab.key === activeKey}
              profile={prof}
              onExit={() => closeTab(tab.key)}
              onReady={(c) => controlsRef.current.set(tab.key, c)}
            />
          ) : null;
        })}

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
