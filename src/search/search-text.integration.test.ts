import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestDatabase } from "@/test/database";
import { searchText } from "./search-text";

describe("searchText", () => {
  let testDb: Awaited<ReturnType<typeof startTestDatabase>>;
  let db: typeof testDb.db;
  let editionId: number;
  let ordinal: number;

  const createChunk = (text: string) =>
    db.chunk.create({
      data: {
        editionId,
        ordinal: ordinal++,
        actType: "PORTARIA",
        title: `PORTARIA N.º ${ordinal}/2026`,
        secretariat: "SEMED",
        date: new Date("2026-09-30"),
        page: 4,
        pageEnd: 5,
        text,
        tokenCount: 6,
        contentHash: "hash-da-edicao",
      },
    });

  const idsFor = async (question: string, limit = 10) =>
    (await searchText(db, question, limit)).map((hit) => hit.chunkId);

  beforeAll(async () => {
    testDb = await startTestDatabase();
    db = testDb.db;
    const territory = await db.territory.create({
      data: { ibgeCode: "2111300", name: "São Luís", uf: "MA" },
    });
    editionId = (
      await db.edition.create({
        data: {
          territoryId: territory.id,
          title: "Diário Oficial - Edição nº 230/XLVI",
          date: new Date("2026-09-30"),
          sourceUrl: "https://exemplo.test/230.pdf",
        },
      })
    ).id;
  }, 180_000);

  beforeEach(async () => {
    await db.chunk.deleteMany();
    ordinal = 0;
  });

  afterAll(async () => {
    await testDb?.stop();
  });

  it("puts the chunk that has every term before chunks that have only some", async () => {
    const onlyOne = await createChunk("merenda ".repeat(30));
    const both = await createChunk("compra de merenda escolar para a rede");

    expect(await idsFor("merenda escolar")).toEqual([both.id, onlyOne.id]);
  });

  it("still returns chunks that have only some of the terms when none has all", async () => {
    const merenda = await createChunk("licitação de merenda");
    const ambulancia = await createChunk("manutenção de ambulância");
    await createChunk("nomeação de professor");

    expect((await idsFor("merenda ambulância")).sort()).toEqual(
      [merenda.id, ambulancia.id].sort(),
    );
  });

  it("matches inflected words, as the Portuguese dictionary does", async () => {
    const { id } = await createChunk("a licitação foi homologada");

    expect(await idsFor("licitações homologadas")).toEqual([id]);
  });

  it("finds an act number however the question writes it", async () => {
    await createChunk("PORTARIA N.º 1.287/2026 - SEMED");
    const target = await createChunk("PORTARIA N.º 1.286/2026 - SEMUS");

    expect(await idsFor("Portaria nº 1.286/2026", 1)).toEqual([target.id]);
    expect(await idsFor("portaria 1286/2026", 1)).toEqual([target.id]);
  });

  it("ranks the chunk with the terms closer together first, among those that have every term", async () => {
    await createChunk(
      `merenda ${"distribuição de gêneros ".repeat(10)} escolar`,
    );
    const close = await createChunk("merenda escolar");

    expect((await idsFor("merenda escolar"))[0]).toBe(close.id);
  });

  it("keeps the best ranked chunks when the limit cuts the list", async () => {
    await createChunk(
      `merenda ${"distribuição de gêneros ".repeat(10)} escolar`,
    );
    const close = await createChunk("merenda escolar");

    expect(await idsFor("merenda escolar", 1)).toEqual([close.id]);
  });

  it("returns what is needed to cite the chunk", async () => {
    const { id } = await createChunk("Art. 1º Fica designada a servidora");

    const [hit] = await searchText(db, "servidora designada", 10);

    expect(hit).toMatchObject({
      chunkId: id,
      ordinal: 0,
      actType: "PORTARIA",
      secretariat: "SEMED",
      date: "2026-09-30",
      page: 4,
      pageEnd: 5,
      text: "Art. 1º Fica designada a servidora",
      edition: {
        id: editionId,
        title: "Diário Oficial - Edição nº 230/XLVI",
        sourceUrl: "https://exemplo.test/230.pdf",
      },
    });
    expect(hit!.score).toBeGreaterThan(0);
  });

  it("stops at the limit", async () => {
    for (let i = 0; i < 5; i++) await createChunk(`licitação número ${i}`);

    expect(await idsFor("licitação", 2)).toHaveLength(2);
  });

  it("returns nothing when no chunk matches", async () => {
    await createChunk("nomeação de professor");

    expect(await idsFor("ambulância")).toEqual([]);
  });

  it("returns nothing, without an error, for a question made only of stop words", async () => {
    await createChunk("nomeação de professor");

    expect(await idsFor("de a o para")).toEqual([]);
  });

  it("orders equally ranked chunks by id, so the answer does not change between runs", async () => {
    const first = await createChunk("licitação de merenda");
    const second = await createChunk("licitação de merenda");
    // regravar muda a posição física da linha, e é isso que o desempate precisa vencer
    await db.chunk.update({
      where: { id: first.id },
      data: { text: "licitação de merenda" },
    });

    expect(await idsFor("licitação merenda")).toEqual([first.id, second.id]);
  });
});
