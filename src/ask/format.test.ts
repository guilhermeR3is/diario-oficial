import { describe, expect, it } from "vitest";
import {
  actLabel,
  formatDate,
  formatMegabytes,
  formatPages,
  formatSeconds,
  keepCurrencyTogether,
  pdfLink,
  reflowLines,
  shortEdition,
} from "./format";

describe("format", () => {
  it("names act types in Portuguese, keeping an unknown one as it came", () => {
    expect(actLabel("RESOLUCAO")).toBe("Resolução");
    expect(actLabel("OUTRO")).toBe("Outro ato");
    expect(actLabel("NOVO_TIPO")).toBe("NOVO_TIPO");
  });

  it("formats a date without letting the time zone move the day", () => {
    expect(formatDate("2026-08-01")).toBe("01/08/2026");
    expect(formatDate("2026-09-30T00:00:00.000Z")).toBe("30/09/2026");
  });

  it("shows one page or a range", () => {
    expect(formatPages(12, 12)).toBe("p. 12");
    expect(formatPages(24, 26)).toBe("p. 24–26");
  });

  it.each([
    ["Diário Oficial - Edição nº 215/XLVI Extra", "Edição nº 215 Extra"],
    ["Diário Oficial - Edição nº 163/XLVI", "Edição nº 163"],
    ["Suplemento especial", "Suplemento especial"],
  ])("shortens %s", (title, short) => {
    expect(shortEdition(title)).toBe(short);
  });

  it("formats seconds and megabytes the Brazilian way", () => {
    expect(formatSeconds(3250)).toBe("3,3 s");
    expect(formatMegabytes(339_800_000)).toBe("340 MB");
  });

  it("links the PDF straight to the cited page", () => {
    expect(pdfLink("https://exemplo.test/1.pdf", 24)).toBe(
      "https://exemplo.test/1.pdf#page=24",
    );
  });
});

describe("reflowLines", () => {
  it("joins the lines the PDF broke by width and keeps the breaks after final punctuation", () => {
    const pdf = [
      "EXTRATO DO 1º APOSTILAMENTO AO 4º TERMO ADITIVO AO",
      "CONTRATO N.º 009/2024; VALOR: R$ 35.248.482,72;",
      "FUNDAMENTAÇÃO LEGAL: LEI FEDERAL Nº",
      "8.666/1993.",
      "Publicado por: Fulano",
    ].join("\n");

    expect(reflowLines(pdf)).toBe(
      [
        "EXTRATO DO 1º APOSTILAMENTO AO 4º TERMO ADITIVO AO CONTRATO N.º 009/2024; VALOR: R$ 35.248.482,72;",
        "FUNDAMENTAÇÃO LEGAL: LEI FEDERAL Nº 8.666/1993.",
        "Publicado por: Fulano",
      ].join("\n"),
    );
  });

  it("glues a word hyphenated at the end of a line without adding a space", () => {
    expect(reflowLines("da SUBSTI-\nTUIÇÃO do índice")).toBe(
      "da SUBSTI-TUIÇÃO do índice",
    );
  });

  it("keeps blank lines between paragraphs", () => {
    expect(
      reflowLines("Art. 1º Fica criado o programa\n\nArt. 2º Revoga"),
    ).toBe("Art. 1º Fica criado o programa\n\nArt. 2º Revoga");
  });
});

describe("keepCurrencyTogether", () => {
  it("binds the currency sign to the number", () => {
    expect(keepCurrencyTogether("valor de R$ 18.200,00")).toBe(
      `valor de R$${String.fromCodePoint(0xa0)}18.200,00`,
    );
  });
});
