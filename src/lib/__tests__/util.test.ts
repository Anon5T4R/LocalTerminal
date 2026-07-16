import { describe, expect, it } from "vitest";
import { clampFontSize, nextOrdinal, tabTitle } from "../util";

describe("tabTitle / nextOrdinal", () => {
  it("primeira aba sem número; repetidas numeram", () => {
    expect(tabTitle("PowerShell", 1)).toBe("PowerShell");
    expect(tabTitle("PowerShell", 2)).toBe("PowerShell · 2");
  });

  it("tira o sufixo (padrão) do Unix", () => {
    expect(tabTitle("bash (padrão)", 1)).toBe("bash");
  });

  it("ordinal conta só o mesmo perfil", () => {
    const tabs = [{ profileId: "pwsh" }, { profileId: "cmd" }, { profileId: "pwsh" }];
    expect(nextOrdinal(tabs, "pwsh")).toBe(3);
    expect(nextOrdinal(tabs, "cmd")).toBe(2);
    expect(nextOrdinal(tabs, "gitbash")).toBe(1);
  });
});

describe("clampFontSize", () => {
  it("limita ao intervalo 9–28", () => {
    expect(clampFontSize(13)).toBe(13);
    expect(clampFontSize(4)).toBe(9);
    expect(clampFontSize(60)).toBe(28);
    expect(clampFontSize(13.6)).toBe(14);
  });
});
