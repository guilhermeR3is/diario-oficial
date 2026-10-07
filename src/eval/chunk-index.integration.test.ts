import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDatabase } from "@/test/database";
import { loadChunkIndex } from "./chunk-index";

describe("loadChunkIndex", () => {
  let testDb: Awaited<ReturnType<typeof startTestDatabase>>;

  beforeAll(async () => {
    testDb = await startTestDatabase();
  }, 180_000);

  afterAll(async () => {
    await testDb?.stop();
  });

  it("returns the stable key, the place and the text of every chunk", async () => {
    const { db } = testDb;
    const territory = await db.territory.create({
      data: { ibgeCode: "2111300", name: "São Luís", uf: "MA" },
    });
    const edition = await db.edition.create({
      data: {
        territoryId: territory.id,
        title: "Diário Oficial - Edição nº 230/XLVI",
        date: new Date("2026-09-30"),
        sourceUrl: "https://exemplo.test/230.pdf",
      },
    });
    await db.chunk.create({
      data: {
        editionId: edition.id,
        ordinal: 7,
        actType: "PORTARIA",
        title: "PORTARIA N.º 1/2026",
        date: new Date("2026-09-30"),
        page: 4,
        pageEnd: 5,
        text: "Art. 1º Fica designada...",
        tokenCount: 6,
        contentHash: "hash-da-edicao",
      },
    });

    expect(await loadChunkIndex(db)).toEqual([
      {
        sourceUrl: "https://exemplo.test/230.pdf",
        ordinal: 7,
        page: 4,
        title: "PORTARIA N.º 1/2026",
        editionTitle: "Diário Oficial - Edição nº 230/XLVI",
        text: "Art. 1º Fica designada...",
      },
    ]);
  });
});
