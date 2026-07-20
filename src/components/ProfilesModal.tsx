import { useEffect, useState } from "react";
import { profilesSet, type ShellProfile } from "../lib/backend";
import { t, type MessageKey } from "../lib/i18n";
import {
  envToText,
  newProfile,
  parseEnvText,
  uniqueName,
  type TermProfile,
} from "../lib/profiles";
import { TERM_SCHEMES } from "../lib/schemes";
import { FONT_FAMILIES, useUi } from "../state/ui";

/** Rótulo de cada esquema. `Record<string, MessageKey>` em vez de montar a
 *  chave com template: assim o `tsc` recusa esquema sem tradução. */
const SCHEME_LABEL: Record<string, MessageKey> = {
  classic: "scheme.classic",
  paper: "scheme.paper",
  solarized: "scheme.solarized",
  grape: "scheme.grape",
  matrix: "scheme.matrix",
};

interface Props {
  shells: ShellProfile[];
  profiles: TermProfile[];
  onChange: (p: TermProfile[]) => void;
}

/**
 * Perfis: conjuntos salvos de shell + diretório + variáveis + aparência.
 *
 * O ambiente é editado como TEXTO `KEY=VALUE` (uma por linha) em vez de uma
 * grade de dois campos: quem usa isso já tem um `.env` pra colar, e uma grade
 * transformaria colar em 20 cliques.
 */
export default function ProfilesModal({ shells, profiles, onChange }: Props) {
  const open = useUi((s) => s.profilesOpen);
  const setOpen = useUi((s) => s.setProfilesOpen);
  const pushToast = useUi((s) => s.pushToast);
  const [sel, setSel] = useState<string | null>(null);
  const [envText, setEnvText] = useState("");

  const current = profiles.find((p) => p.id === sel) ?? null;

  // Ao trocar de perfil, o textarea recarrega do perfil escolhido.
  useEffect(() => {
    setEnvText(current ? envToText(current.env) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel]);

  if (!open) return null;

  const persist = (next: TermProfile[]) => {
    onChange(next);
    void profilesSet(next).catch((e) =>
      pushToast("error", t("profiles.saveFailed", { error: String(e) })),
    );
  };

  const patch = (fields: Partial<TermProfile>) => {
    if (!current) return;
    persist(profiles.map((p) => (p.id === current.id ? { ...p, ...fields } : p)));
  };

  const add = () => {
    const base = shells[0];
    if (!base) return;
    const p = newProfile(base, profiles.map((x) => x.name));
    persist([...profiles, p]);
    setSel(p.id);
  };

  const duplicate = () => {
    if (!current) return;
    const copy: TermProfile = {
      ...current,
      id: crypto.randomUUID(),
      // Cópia profunda do ambiente: sem isso os dois perfis apontariam pro
      // MESMO array e editar um mexeria no outro sem aviso.
      env: current.env.map((e) => ({ ...e })),
      args: [...current.args],
      name: uniqueName(current.name, profiles.map((x) => x.name)),
    };
    persist([...profiles, copy]);
    setSel(copy.id);
  };

  const remove = () => {
    if (!current) return;
    persist(profiles.filter((p) => p.id !== current.id));
    setSel(null);
  };

  return (
    <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>{t("profiles.title")}</h2>

        <div className="profiles-grid">
          <div className="profiles-list">
            {profiles.length === 0 && <div className="muted small">{t("profiles.empty")}</div>}
            {profiles.map((p) => (
              <button
                key={p.id}
                className={`menu-item ${p.id === sel ? "active" : ""}`}
                onClick={() => setSel(p.id)}
              >
                {p.name}
              </button>
            ))}
            <div className="profiles-list-actions">
              <button onClick={add} disabled={shells.length === 0}>
                {t("profiles.add")}
              </button>
              <button onClick={duplicate} disabled={!current}>
                {t("profiles.duplicate")}
              </button>
              <button onClick={remove} disabled={!current}>
                {t("profiles.remove")}
              </button>
            </div>
          </div>

          <div className="profiles-form">
            {!current && <p className="muted small">{t("profiles.pick")}</p>}
            {current && (
              <>
                <label className="field">
                  <span>{t("profiles.name")}</span>
                  <input
                    value={current.name}
                    onChange={(e) => patch({ name: e.target.value })}
                  />
                </label>

                <label className="field">
                  <span>{t("profiles.shell")}</span>
                  <select
                    value={current.shell}
                    onChange={(e) => {
                      const s = shells.find((x) => x.shell === e.target.value);
                      patch({ shell: e.target.value, args: s ? [...s.args] : current.args });
                    }}
                  >
                    {/* O shell do perfil pode não estar mais instalado. Some da
                        lista de detectados, mas continua sendo o valor salvo —
                        então entra como opção própria em vez de o <select>
                        "pular" calado pro primeiro item e reescrever o perfil. */}
                    {!shells.some((s) => s.shell === current.shell) && (
                      <option value={current.shell}>
                        {current.shell} — {t("profiles.notInstalled")}
                      </option>
                    )}
                    {shells.map((s) => (
                      <option key={s.id} value={s.shell}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>{t("profiles.args")}</span>
                  <input
                    value={current.args.join(" ")}
                    placeholder="-NoLogo"
                    onChange={(e) =>
                      patch({ args: e.target.value.split(/\s+/).filter(Boolean) })
                    }
                  />
                </label>

                <label className="field">
                  <span>{t("profiles.cwd")}</span>
                  <input
                    value={current.cwd ?? ""}
                    placeholder={t("profiles.cwdPlaceholder")}
                    onChange={(e) => patch({ cwd: e.target.value.trim() || null })}
                  />
                </label>

                <label className="field">
                  <span>{t("profiles.env")}</span>
                  <textarea
                    rows={5}
                    spellCheck={false}
                    value={envText}
                    placeholder={"GITHUB_TOKEN=…\nRUST_LOG=debug"}
                    onChange={(e) => setEnvText(e.target.value)}
                    onBlur={() => patch({ env: parseEnvText(envText) })}
                  />
                </label>
                <p className="muted small">{t("profiles.envHelp")}</p>

                <label className="field">
                  <span>{t("profiles.font")}</span>
                  <select
                    value={current.fontFamily ?? ""}
                    onChange={(e) => patch({ fontFamily: e.target.value || null })}
                  >
                    <option value="">{t("profiles.inherit")}</option>
                    {FONT_FAMILIES.map((f) => (
                      <option key={f.id} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>{t("profiles.fontSize")}</span>
                  <input
                    type="number"
                    min={9}
                    max={28}
                    value={current.fontSize ?? ""}
                    placeholder={t("profiles.inherit")}
                    onChange={(e) =>
                      patch({ fontSize: e.target.value ? Number(e.target.value) : null })
                    }
                  />
                </label>

                <label className="field">
                  <span>{t("profiles.scheme")}</span>
                  <select
                    value={current.theme ?? ""}
                    onChange={(e) => patch({ theme: e.target.value || null })}
                  >
                    <option value="">{t("profiles.inherit")}</option>
                    {TERM_SCHEMES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {t(SCHEME_LABEL[s.id])}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </div>
        </div>

        <div className="modal-actions">
          <button className="primary" onClick={() => setOpen(false)}>
            {t("dlg.ok")}
          </button>
        </div>
      </div>
    </div>
  );
}
