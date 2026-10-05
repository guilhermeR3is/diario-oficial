import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { stripPageFooter } from "./page-footer";

type EditionFixture = {
  title: string;
  date: string;
  contentHash: string;
  pages: string[];
};

const fixturesDir = fileURLToPath(new URL("./fixtures/", import.meta.url));
const fixtures = readdirSync(fixturesDir)
  .filter((file) => file.endsWith(".json"))
  .map((file) => ({
    file,
    ...(JSON.parse(readFileSync(fixturesDir + file, "utf8")) as EditionFixture),
  }));

describe("edition fixtures", () => {
  it("has the ten editions chosen for the segmenter", () => {
    expect(fixtures).toHaveLength(10);
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
