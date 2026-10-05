import { describe, expect, it } from "vitest";
import { stripPageFooter } from "./page-footer";

const FOOTER = [
  "SÃO LUÍS/MA * QUINTA * 02 DE JULHO DE 2026 ANO XLVI * N.º 157 * ISSN 2764-8958",
  "Este documento pode ser verificado no endereço eletrônico",
  "https://diariooficial.saoluis.ma.gov.br 4 / 98 Documento assinado com certificado digital e carimbo de tempo,",
  "conforme Instrução Normativa N.º 70/2021 do TCE/MA.",
].join("\n");

describe("stripPageFooter", () => {
  it("removes the footer and keeps the page body", () => {
    const body = "Publicado por: Fulano\nCódigo identificador: abc";

    expect(stripPageFooter(`${body}\n${FOOTER}`)).toBe(body);
  });

  it("removes the footer of an extra edition", () => {
    const extra = FOOTER.replace("8958", "8958 * EDIÇÃO EXTRA *");

    expect(stripPageFooter(`texto\n${extra}\n`)).toBe("texto");
  });

  it("returns an empty string for a page that has only the footer", () => {
    expect(stripPageFooter(FOOTER)).toBe("");
  });

  it("keeps a citation of another edition inside the body", () => {
    const body =
      "Revoga-se a portaria publicada no Diário Oficial\nSÃO LUÍS/MA * QUARTA * 20 DE MAIO DE 2026, ANO XLVI * N.º 118 *\nISSN 2764-8958 pág.; 35/39.\nArt. 4º. Esta Portaria entra em vigor.";

    expect(stripPageFooter(`${body}\n${FOOTER}`)).toBe(body);
  });

  it("throws when the page does not end with the footer", () => {
    expect(() => stripPageFooter("só texto")).toThrow(/footer/);
    expect(() => stripPageFooter(`${FOOTER}\ntexto depois`)).toThrow(/footer/);
  });
});
