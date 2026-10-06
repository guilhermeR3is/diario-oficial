import { describe, expect, it } from "vitest";
import { stripPageFooter } from "./page-footer";
import { loadFixtures } from "./test-fixtures";

const fixtures = loadFixtures();

describe("edition fixtures", () => {
  it("has the twelve editions chosen for the segmenter", () => {
    expect(fixtures).toHaveLength(12);
  });

  describe.each(fixtures)("$file", (fixture) => {
    it("keeps the pages in order, as each footer says", () => {
      fixture.pages.forEach((page, index) => {
        const numbers = /(\d+) \/ (\d+)\n/.exec(page.slice(-700));
        expect([numbers?.[1], numbers?.[2]]).toEqual([
          String(index + 1),
          String(fixture.pages.length),
        ]);
      });
    });

    it("loses the footer of every page without an error", () => {
      for (const page of fixture.pages) {
        expect(stripPageFooter(page)).not.toContain(
          "Documento assinado com certificado",
        );
      }
    });
  });
});
