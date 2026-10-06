import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "../../generated/prisma/client";

export type EditionFixture = {
  file: string;
  title: string;
  date: string;
  contentHash: string;
  pages: string[];
};

const fixturesDir = fileURLToPath(new URL("./fixtures/", import.meta.url));

export function loadFixtures(): EditionFixture[] {
  return readdirSync(fixturesDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => ({
      file,
      ...(JSON.parse(readFileSync(fixturesDir + file, "utf8")) as Omit<
        EditionFixture,
        "file"
      >),
    }));
}

// a 157 já segmenta sem problema; mudar o ano do título de uma página a devolve ao caso "título não achado" (página 23)
export function withBrokenTitle(fixture: EditionFixture): EditionFixture {
  return {
    ...fixture,
    pages: fixture.pages.map((page, index) =>
      index === 22
        ? page.replace("52/2023-\nGAB/SEMIT", "52/2024-\nGAB/SEMIT")
        : page,
    ),
  };
}

export function insertFixtureEdition(
  db: PrismaClient,
  territoryId: number,
  fixture: EditionFixture,
) {
  return db.edition.create({
    data: {
      territoryId,
      title: fixture.title,
      date: new Date(fixture.date),
      sourceUrl: `https://exemplo.test/${fixture.file}`,
      contentHash: fixture.contentHash,
      pageCount: fixture.pages.length,
      status: "PROCESSED",
    },
  });
}

// o arquivo "PDF" dos testes guarda só o hash da fixture; esta função devolve as páginas dela
export function pagesFromStandIn(fixtures: EditionFixture[]) {
  return async (bytes: Uint8Array): Promise<string[]> => {
    const hash = new TextDecoder().decode(bytes);
    const fixture = fixtures.find((f) => f.contentHash === hash);
    if (!fixture) throw new Error(`no fixture for ${hash}`);
    return fixture.pages;
  };
}
