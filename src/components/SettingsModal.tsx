import type { ShellProfile } from "../lib/backend";
import { LOCALE_LABELS, setLocale, t, useLocale, type Locale } from "../lib/i18n";
import { FONT_FAMILIES, useUi, type Theme } from "../state/ui";

/** Configurações: tema, idioma, shell padrão, fonte, copiar ao selecionar. */
export default function SettingsModal({ profiles }: { profiles: ShellProfile[] }) {
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
            value={defaultProfile ?? profiles[0]?.id ?? ""}
            onChange={(e) => setDefaultProfile(e.target.value)}
          >
            {profiles.map((p) => (
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
