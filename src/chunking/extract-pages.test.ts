import { describe, expect, it } from "vitest";
import { buildPdf, buildTextPdf } from "../ingest/test-pdf";
import { extractPages } from "./extract-pages";

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
    const pages = await extractPages(buildPdf(2));

    expect(pages).toEqual(["", ""]);
  });

  it("leaves the original bytes usable", async () => {
    const bytes = buildTextPdf(["ONLY PAGE"]);

    await extractPages(bytes);

    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it("rejects bytes that are not a readable PDF", async () => {
    await expect(
      extractPages(new TextEncoder().encode("%PDF-1.4 lixo")),
    ).rejects.toThrow();
  });
});
