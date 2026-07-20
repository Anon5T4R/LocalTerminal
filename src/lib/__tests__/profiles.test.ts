import { describe, expect, it } from "vitest";
import {
  appearanceOf,
  envSummary,
  envToText,
  menuEntries,
  parseEnvText,
  pickEntry,
  profileFromShell,
  uniqueName,
  type TermProfile,
} from "../profiles";
import { isLightBg, schemeById } from "../schemes";

const shell = (id: string, name: string, exe: string) => ({ id, name, shell: exe, args: [] });

const prof = (over: Partial<TermProfile> = {}): TermProfile => ({
  id: "p1",
  name: "Projeto",
  shell: "pwsh.exe",
  args: [],
  cwd: null,
  env: [],
  fontFamily: null,
  fontSize: null,
  theme: null,
  ...over,
});

describe("parseEnvText", () => {
  it("lê pares simples e ignora linha vazia e comentário", () => {
    const env = parseEnvText("FOO=bar\n\n# comentário\nBAZ=qux\n");
    expect(env).toEqual([
      { key: "FOO", value: "bar" },
      { key: "BAZ", value: "qux" },
    ]);
  });

  it("só o PRIMEIRO = separa — o resto fica no valor", () => {
    // O caso que morde: URL de banco com querystring. Um split ingênuo em "="
    // devolveria "postgres://u:p@h/db?a" e o app conectaria no lugar errado.
    const env = parseEnvText("DATABASE_URL=postgres://u:p@h/db?a=b&c=d");
    expect(env).toEqual([{ key: "DATABASE_URL", value: "postgres://u:p@h/db?a=b&c=d" }]);
  });

  it("aceita o formato de shell e tira as aspas do valor inteiro", () => {
    expect(parseEnvText("export FOO=bar")).toEqual([{ key: "FOO", value: "bar" }]);
    expect(parseEnvText('MSG="olá mundo"')).toEqual([{ key: "MSG", value: "olá mundo" }]);
    expect(parseEnvText("MSG='x'")).toEqual([{ key: "MSG", value: "x" }]);
    // Aspa NO MEIO é conteúdo, não delimitador.
    expect(parseEnvText('J={"a":1}')).toEqual([{ key: "J", value: '{"a":1}' }]);
  });

  it("linha sem = e chave vazia são descartadas", () => {
    expect(parseEnvText("apenas texto\n=semNome\nOK=1")).toEqual([{ key: "OK", value: "1" }]);
  });

  it("ida e volta com envToText preserva os pares", () => {
    const env = [
      { key: "A", value: "1" },
      { key: "B", value: "x=y" },
    ];
    expect(parseEnvText(envToText(env))).toEqual(env);
  });

  it("valor vazio é um valor válido", () => {
    expect(parseEnvText("EMPTY=")).toEqual([{ key: "EMPTY", value: "" }]);
  });
});

describe("envSummary", () => {
  it("mostra só as chaves — o valor pode ser um token", () => {
    const s = envSummary([
      { key: "GITHUB_TOKEN", value: "ghp_supersecreto" },
      { key: "RUST_LOG", value: "debug" },
    ]);
    expect(s).toBe("GITHUB_TOKEN, RUST_LOG");
    expect(s).not.toContain("ghp_supersecreto");
    expect(s).not.toContain("debug");
  });
});

describe("menuEntries", () => {
  const detected = [shell("pwsh", "PowerShell", "pwsh.exe"), shell("cmd", "cmd", "cmd.exe")];

  it("salvos primeiro, detectados depois", () => {
    const e = menuEntries(detected, [prof()]);
    expect(e.map((x) => x.name)).toEqual(["Projeto", "PowerShell", "cmd"]);
    expect(e[0].saved).toBe(true);
    expect(e[1].saved).toBe(false);
  });

  it("perfil salvo com shell desinstalado FICA, marcado como ausente", () => {
    // Apagar a configuração de alguém porque o shell saiu do PATH seria perda
    // silenciosa — o perfil continua na lista, avisando.
    const e = menuEntries(detected, [prof({ shell: "fish.exe" })]);
    expect(e[0].missing).toBe(true);
    expect(e[0].saved).toBe(true);
    expect(e.some((x) => x.name === "Projeto")).toBe(true);
  });

  it("compara o executável sem ligar pra caixa (Windows)", () => {
    const e = menuEntries(detected, [prof({ shell: "PWSH.EXE" })]);
    expect(e[0].missing).toBe(false);
  });

  it("perfil salvo com o mesmo id de um detectado não duplica a entrada", () => {
    const e = menuEntries(detected, [prof({ id: "cmd", name: "Meu cmd", shell: "cmd.exe" })]);
    expect(e.filter((x) => x.id === "cmd")).toHaveLength(1);
    expect(e.find((x) => x.id === "cmd")?.name).toBe("Meu cmd");
  });

  it("sem shell nenhum a lista fica vazia (e não estoura)", () => {
    expect(menuEntries([], [])).toEqual([]);
  });
});

describe("pickEntry", () => {
  const entries = menuEntries([shell("cmd", "cmd", "cmd.exe")], [prof()]);

  it("acha pelo id", () => {
    expect(pickEntry(entries, "cmd")?.id).toBe("cmd");
  });

  it("id que sumiu cai no primeiro em vez de não abrir nada", () => {
    // O perfil padrão foi apagado nas Configurações; Ctrl+Shift+T tem que
    // continuar abrindo alguma coisa.
    expect(pickEntry(entries, "perfil-apagado")?.id).toBe("p1");
    expect(pickEntry(entries, null)?.id).toBe("p1");
  });

  it("lista vazia devolve undefined em vez de estourar", () => {
    expect(pickEntry([], "x")).toBeUndefined();
  });
});

describe("uniqueName", () => {
  it("não substitui calado: numera a colisão", () => {
    expect(uniqueName("Projeto", ["Projeto"])).toBe("Projeto (2)");
    expect(uniqueName("Projeto", ["Projeto", "Projeto (2)"])).toBe("Projeto (3)");
    expect(uniqueName("Outro", ["Projeto"])).toBe("Outro");
    expect(uniqueName("   ", [])).toBe("Perfil");
  });
});

describe("appearanceOf", () => {
  const base = { fontFamily: "Consolas", fontSize: 13, theme: "dark" };

  it("null herda campo a campo", () => {
    expect(appearanceOf(prof(), base)).toEqual(base);
  });

  it("o perfil sobrescreve só o que definiu", () => {
    const a = appearanceOf(prof({ fontSize: 18 }), base);
    expect(a).toEqual({ fontFamily: "Consolas", fontSize: 18, theme: "dark" });
  });

  it("0 é um valor, não ausência (?? e não ||)", () => {
    // Com `||` um fontSize 0 herdaria 13 e o bug ficaria invisível.
    expect(appearanceOf(prof({ fontSize: 0 }), base).fontSize).toBe(0);
  });
});

describe("profileFromShell", () => {
  it("shell detectado vira perfil sem cwd/env/aparência", () => {
    const p = profileFromShell(shell("cmd", "cmd", "cmd.exe"));
    expect(p.cwd).toBeNull();
    expect(p.env).toEqual([]);
    expect(p.theme).toBeNull();
  });
});

describe("schemes", () => {
  it("null e 'inherit' seguem o tema do app", () => {
    expect(schemeById(null)).toBeNull();
    expect(schemeById("inherit")).toBeNull();
    expect(schemeById("")).toBeNull();
  });

  it("id desconhecido não estoura — herda", () => {
    expect(schemeById("esquema-que-nao-existe")).toBeNull();
  });

  it("o esquema claro é detectado como claro (senão o ANSI fica ilegível)", () => {
    expect(isLightBg(schemeById("paper")!.background)).toBe(true);
    expect(isLightBg(schemeById("classic")!.background)).toBe(false);
    expect(isLightBg(schemeById("matrix")!.background)).toBe(false);
  });

  it("hex curto/inválido não vira claro por acidente", () => {
    expect(isLightBg("#fff")).toBe(false);
    expect(isLightBg("")).toBe(false);
  });
});
