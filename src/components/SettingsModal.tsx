import { useEffect, useState } from "react";
import { isTauri, quakeConfig, quakeConfigSet, type QuakeConfig } from "../lib/backend";
import { LOCALE_LABELS, setLocale, t, useLocale, type Locale } from "../lib/i18n";
import type { MenuEntry } from "../lib/profiles";
import { FONT_FAMILIES, useUi, type Theme } from "../state/ui";

/** Configurações: tema, idioma, perfil padrão, fonte, quake mode. */
export default function SettingsModal({ entries }: { entries: MenuEntry[] }) {
  const open = useUi((s) => s.settingsOpen);
  const setOpen = useUi((s) => s.setSettingsOpen);
  const theme = useUi((s) => s.theme);
  const setTheme = useUi((s) => s.setTheme);
  const fontSize = useUi((s) => s.fontSize);
  const setFontSize = useUi((s) => s.setFontSize);
  const fontFamily = useUi((s) => s.fontFamily);
  const setFontFamily = useUi((s) => s.setFontFamily);
  const copyOnSelect = useUi((s) => s.copyOnSelect);
  const setCopyOnSelect = useUi((s) => s.setCopyOnSelect);
  const defaultProfile = useUi((s) => s.defaultProfile);
  const setDefaultProfile = useUi((s) => s.setDefaultProfile);
  const locale = useLocale();

  const [quake, setQuake] = useState<QuakeConfig | null>(null);
  const [quakeErr, setQuakeErr] = useState<string | null>(null);
  const [quakeOk, setQuakeOk] = useState(false);

  useEffect(() => {
    if (!open || !isTauri || quake) return;
    void quakeConfig().then(setQuake).catch(() => {});
  }, [open, quake]);

  /**
   * Salva e tenta registrar. O REGISTRO é a única prova de que o atalho vale:
   * sem mostrar a falha, o usuário aperta a tecla, não acontece nada, e o app
   * parece quebrado. Padrão do LocalTranslate 0.4.0.
   */
  const applyQuake = async (next: QuakeConfig) => {
    setQuake(next);
    setQuakeOk(false);
    try {
      await quakeConfigSet(next);
      setQuakeErr(null);
      setQuakeOk(true);
    } catch (e) {
      const msg = typeof e === "string" ? e : String((e as Error)?.message ?? e);
      setQuakeErr(
        msg.includes("SHORTCUT_BUSY") ? t("quake.busy", { accel: next.shortcut }) : msg,
      );
    }
  };

  if (!open) return null;

  const themes: { value: Theme; label: string }[] = [
    { value: "system", label: t("settings.themeSystem") },
    { value: "light", label: t("settings.themeLight") },
    { value: "dark", label: t("settings.themeDark") },
    { value: "nature", label: t("settings.themeNature") },
    { value: "darkblue", label: t("settings.themeDarkBlue") },
    { value: "calmgreen", label: t("settings.themeCalmGreen") },
    { value: "pastelpink", label: t("settings.themePastelPink") },
    { value: "punkprincess", label: t("settings.themePunkPrincess") },
  ];

  return (
    <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t("settings.title")}</h2>

        <div className="settings-row">
          <span>{t("settings.theme")}</span>
          <div className="segmented">
            {themes.map((th) => (
              <button
                key={th.value}
                className={theme === th.value ? "active" : ""}
                onClick={() => setTheme(th.value)}
              >
                {th.label}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-row">
          <span>{t("settings.language")}</span>
          <div className="segmented">
            {(Object.keys(LOCALE_LABELS) as Locale[]).map((l) => (
              <button key={l} className={locale === l ? "active" : ""} onClick={() => setLocale(l)}>
                {LOCALE_LABELS[l]}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-row">
          <span>{t("settings.defaultShell")}</span>
          <select
            value={defaultProfile ?? entries[0]?.id ?? ""}
            onChange={(e) => setDefaultProfile(e.target.value)}
          >
            {entries.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="settings-row">
          <span>{t("settings.fontSize")}</span>
          <div className="segmented">
            <button onClick={() => setFontSize(fontSize - 1)}>−</button>
            <span className="font-size-value">{fontSize}</span>
            <button onClick={() => setFontSize(fontSize + 1)}>+</button>
          </div>
        </div>

        <div className="settings-row">
          <span>{t("settings.fontFamily")}</span>
          <select value={fontFamily} onChange={(e) => setFontFamily(e.target.value)}>
            {FONT_FAMILIES.map((f) => (
              <option key={f.id} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        <div className="settings-row">
          <label className="check">
            <input
              type="checkbox"
              checked={copyOnSelect}
              onChange={(e) => setCopyOnSelect(e.target.checked)}
            />
            {t("settings.copyOnSelect")}
          </label>
        </div>

        {quake && (
          <>
            <h3>{t("quake.title")}</h3>
            <p className="muted small">{t("quake.help")}</p>

            <div className="settings-row">
              <label className="check">
                <input
                  type="checkbox"
                  checked={quake.enabled}
                  onChange={(e) => void applyQuake({ ...quake, enabled: e.target.checked })}
                />
                {t("quake.enable")}
              </label>
            </div>

            <div className="settings-row">
              <span>{t("quake.shortcut")}</span>
              <input
                value={quake.shortcut}
                spellCheck={false}
                // No BLUR, não a cada tecla: tentar registrar a cada letra
                // digitada falharia o tempo todo em combinações parciais.
                onChange={(e) => setQuake({ ...quake, shortcut: e.target.value })}
                onBlur={() => void applyQuake(quake)}
              />
            </div>

            <div className="settings-row">
              <span>{t("quake.height")}</span>
              <input
                type="range"
                min={10}
                max={100}
                value={quake.heightPct}
                onChange={(e) => setQuake({ ...quake, heightPct: Number(e.target.value) })}
                onMouseUp={() => void applyQuake(quake)}
              />
              <span className="font-size-value">{quake.heightPct}%</span>
            </div>

            <div className="settings-row">
              <span>{t("quake.width")}</span>
              <input
                type="range"
                min={10}
                max={100}
                value={quake.widthPct}
                onChange={(e) => setQuake({ ...quake, widthPct: Number(e.target.value) })}
                onMouseUp={() => void applyQuake(quake)}
              />
              <span className="font-size-value">{quake.widthPct}%</span>
            </div>

            <div className="settings-row">
              <span>{t("quake.profile")}</span>
              <select
                value={quake.profileId ?? ""}
                onChange={(e) =>
                  void applyQuake({ ...quake, profileId: e.target.value || null })
                }
              >
                <option value="">{t("quake.profileDefault")}</option>
                {entries.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {quakeErr && <div className="banner err">{quakeErr}</div>}
            {quakeOk && !quakeErr && <div className="banner ok">{t("quake.saved")}</div>}
          </>
        )}

        <p className="muted small">{t("settings.shortcuts")}</p>
        <p className="muted about">
          <strong>LocalTerminal</strong>
          {t("settings.about")}
        </p>

        <div className="modal-actions">
          <button className="primary" onClick={() => setOpen(false)}>
            {t("dlg.ok")}
          </button>
        </div>
      </div>
    </div>
  );
}
