import { describe, expect, it } from "vitest";
import {
  ACT_TYPES,
  classifyAct,
  secretariatOf,
  type ActType,
} from "./classify-act";
import { segmentEdition } from "./segment-edition";
import { loadFixtures } from "./test-fixtures";

describe("classifyAct", () => {
  it.each<[string, ActType]>([
    ["PORTARIA N.º 1.943, DE 19 DE JUNHO DE 2026", "PORTARIA"],
    ["PORTARIA SEMAD N.º 1.943, DE 19 DE JUNHO DE 2026", "PORTARIA"],
    ["DECRETO N.º 62.682, DE 01 DE JULHO DE 2026", "DECRETO"],
    ["EXTRATO DO CONTRATO N.º 414/2026", "EXTRATO"],
    ["NOMEAÇÃO DE JOSÉ DA SILVA", "NOMEACAO"],
    ["EXONERAÇÃO DE BENJAMIN MAX PEREIRA SANTOS", "EXONERACAO"],
    ["ATA DE REGISTRO DE PREÇOS N.º 179/2026", "ATA"],
    ["ACÓRDÃO Nº 25/2026", "ACORDAO"],
    ["SÚMULA DE INEXIGIBILIDADE DE LICITAÇÃO", "SUMULA"],
    ["RESOLUÇÃO N.º 55/2026-CMDCA", "RESOLUCAO"],
    ["ERRATA - EDITAL DE CHAMAMENTO PÚBLICO N.º 05/2026", "ERRATA"],
    ["RETIFICAÇÃO DO EDITAL N.º 07/2026", "ERRATA"],
    ["REQUERIMENTO DE LICENÇA – FERREIRA JUNIOR ENGENHARIA", "LICENCIAMENTO"],
    ["RECEBIMENTO DE AUTORIZAÇÃO – CONDOMÍNIO ITÁLIA", "LICENCIAMENTO"],
    ["MENSAGEM DE VETO N.º 3", "OUTRO"],
    ["", "OUTRO"],
  ])("%s -> %s", (title, expected) => {
    expect(classifyAct(title)).toBe(expected);
  });

  it("ignores case and accents", () => {
    expect(classifyAct("portaria nº 5")).toBe("PORTARIA");
    expect(classifyAct("Nomeação de Maria")).toBe("NOMEACAO");
  });

  it("classifies an ordinal term as TERMO but not other ordinal titles", () => {
    expect(classifyAct("PRIMEIRO TERMO ADITIVO À ATA DE REGISTRO")).toBe(
      "TERMO",
    );
    expect(classifyAct("SEGUNDO TERMO ADITIVO AO CONTRATO Nº 14/2025")).toBe(
      "TERMO",
    );
    expect(classifyAct("PRIMEIRO COLOCADO NO PROCESSO")).toBe("OUTRO");
  });

  it("looks past the republication prefix", () => {
    expect(
      classifyAct("REPUBLICAÇÃO DO EXTRATO DO CONTRATO N.º 507/2026"),
    ).toBe("EXTRATO");
    expect(
      classifyAct("REPUBLICADO POR INCORREÇÃO - SEGUNDO TERMO ADITIVO"),
    ).toBe("TERMO");
    expect(
      classifyAct("PUBLICAÇÃO POR INCORREÇÃO - PORTARIA N.º 70/2026"),
    ).toBe("PORTARIA");
    expect(classifyAct("PUBLICAÇÃO DE REQUERIMENTO DE LICENÇA ÚNICA")).toBe(
      "LICENCIAMENTO",
    );
  });

  it("only returns values of the closed list", () => {
    for (const title of ["PORTARIA 1", "XYZ", "123", "ATA", "---"]) {
      expect(ACT_TYPES).toContain(classifyAct(title));
    }
  });
});

describe("secretariatOf", () => {
  it.each<[string | null, string | null]>([
    ["SECRETARIA MUNICIPAL DE SAÚDE - SEMUS", "SEMUS"],
    ["SECRETARIA MUNICIPAL DA MULHER – SEMMU", "SEMMU"],
    ["CONTROLADORIA-GERAL DO MUNICÍPIO - CGM", "CGM"],
    ["INSTITUTO DE PREVIDÊNCIA E ASSISTÊNCIA DO MUNICÍPIO - IPAM", "IPAM"],
    ["PUBLICAÇÕES DE TERCEIROS", null],
    [null, null],
  ])("%s -> %s", (section, expected) => {
    expect(secretariatOf(section)).toBe(expected);
  });
});

describe.each(loadFixtures())("classification on $file", (fixture) => {
  const { acts } = segmentEdition(fixture.pages);

  it("leaves few acts in OUTRO", () => {
    const others = acts.filter((act) => classifyAct(act.title) === "OUTRO");

    expect(others.length / acts.length).toBeLessThan(0.15);
  });

  it("finds an acronym for every section except third-party publications", () => {
    for (const act of acts) {
      if (act.section === "PUBLICAÇÕES DE TERCEIROS") continue;
      expect(secretariatOf(act.section)).not.toBeNull();
    }
  });
});
