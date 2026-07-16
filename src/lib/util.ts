/** Título da aba: nome curto do perfil + índice ("PowerShell · 2"). */
export function tabTitle(profileName: string, ordinal: number): string {
  const short = profileName.replace(/\s*\(padrão\)$/, "");
  return ordinal > 1 ? `${short} · ${ordinal}` : short;
}

/** Ordinal da nova aba: quantas abas do mesmo perfil já existem + 1. */
export function nextOrdinal(existing: { profileId: string }[], profileId: string): number {
  return existing.filter((t) => t.profileId === profileId).length + 1;
}

/** Limita o tamanho da fonte a um intervalo são. */
export function clampFontSize(v: number): number {
  return Math.min(28, Math.max(9, Math.round(v)));
}
