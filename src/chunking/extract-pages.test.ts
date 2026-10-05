import { describe, expect, it } from "vitest";
import { buildPdf, buildTextPdf } from "../ingest/test-pdf";
import { extractPages, normalizeGlyphs } from "./extract-pages";

const char = (code: number) => String.fromCodePoint(code);

describe("extractPages", () => {
  it("returns one text per page, in order", async () => {
    const pages = await extractPages(
      buildTextPdf(["FIRST PAGE", "SECOND PAGE", "THIRD PAGE"]),
    );

    expect(pages).toHaveLength(3);
    expect(pages[0]).toContain("FIRST PAGE");
    expect(pages[1]).toContain("SECOND PAGE");
    expect(pages[2]).toContain("THIRD PAGE");
  });

  it("keeps blank pages as empty texts, so page numbers do not shift", async () => {
    expect(await extractPages(buildPdf(2))).toEqual(["", ""]);
  });

  it("rejects bytes that are not a readable PDF", async () => {
    await expect(
      extractPages(new TextEncoder().encode("%PDF-1.4 lixo")),
    ).rejects.toThrow(/exited with code/);
  });

  it("explains how to install Poppler when pdftotext is missing", async () => {
    await expect(
      extractPages(buildPdf(1), "pdftotext-that-does-not-exist"),
    ).rejects.toThrow(/install Poppler/);
  });
});

describe("normalizeGlyphs", () => {
  it("replaces ligatures with their letters", () => {
    const text = `O${char(0xfb01)}cial ${char(0xfb02)}uxo o${char(0xfb00)}ice e${char(0xfb03)}cient`;

    expect(normalizeGlyphs(text)).toBe("Oficial fluxo office efficient");
  });

  it("keeps accents and ordinal marks untouched", () => {
    expect(normalizeGlyphs("Portaria n.º 12, Art. 1º, São Luís")).toBe(
      "Portaria n.º 12, Art. 1º, São Luís",
    );
  });

  it("drops zero-width spaces", () => {
    expect(normalizeGlyphs(`${char(0x200b)}COSTA`)).toBe("COSTA");
  });

  it("turns the Symbol-font bullet into a bullet and drops other private-use symbols", () => {
    expect(normalizeGlyphs(`${char(0xf0b7)} item${char(0xe218)}`)).toBe(
      "• item",
    );
  });
});
