import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestDatabase } from "@/test/database";
import { searchChunks } from "./search-chunks";
import { CANDIDATES_PER_RANKING, searchHybrid } from "./search-hybrid";

const DIMENSIONS = 768;

function vectorWith(nonZero: Record<number, number>) {
  const values = new Array<number>(DIMENSIONS).fill(0);
  for (const [position, value] of Object.entries(nonZero)) {
    values[Number(position)] = value;
  }
  return values;
}

describe("searchHybrid", () => {
  let testDb: Awaited<ReturnType<typeof startTestDatabase>>;
  let db: typeof testDb.db;
  let editionId: number;
  let ordinal: number;

  const createChunk = async (text: string, vector: number[] | null) => {
    const chunk = await db.chunk.create({
      data: {
        editionId,
        ordinal: ordinal++,
        actType: "PORTARIA",
        title: `PORTARIA N.º ${ordinal}/2026`,
        date: new Date("2026-09-30"),
        page: 4,
        pageEnd: 5,
        text,
        tokenCount: 6,
        contentHash: "hash-da-edicao",
      },
    });
    if (vector) {
      const literal = `[${vector.join(",")}]`;
      await db.$executeRaw`UPDATE chunk SET embedding = ${literal}::vector, embedding_model = 'modelo-de-teste' WHERE id = ${chunk.id}`;
    }
    return chunk;
  };

  const ids = async (question: string, vector: number[], limit = 10) =>
    (await searchHybrid(db, { question, vector }, limit)).map(
      (hit) => hit.chunkId,
    );

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

  it("brings in an exact number that the search by meaning ranks out of its candidates", async () => {
    for (let i = 0; i <= CANDIDATES_PER_RANKING; i++) {
      await createChunk(
        `ato sem relação ${i}`,
        vectorWith({ 0: 1, 1: i / 100 }),
      );
    }
    const target = await createChunk(
      "PORTARIA N.º 1.286/2026 - SEMUS",
      vectorWith({ 5: 1 }),
    );

    const byMeaningOnly = (
      await searchChunks(db, vectorWith({ 0: 1 }), CANDIDATES_PER_RANKING)
    ).map((hit) => hit.chunkId);
    const hybrid = await ids("Portaria nº 1.286/2026", vectorWith({ 0: 1 }));

    expect(byMeaningOnly).not.toContain(target.id);
    expect(hybrid).toContain(target.id);
  });

  it("brings in a chunk whose words the question does not use, found by meaning alone", async () => {
    const byMeaning = await createChunk(
      "alimentação dos alunos da rede",
      vectorWith({ 0: 1 }),
    );
    await createChunk("nomeação de professor", vectorWith({ 3: 1 }));

    expect((await ids("merenda escolar", vectorWith({ 0: 1 })))[0]).toBe(
      byMeaning.id,
    );
  });

  it("puts first the chunk that both searches like", async () => {
    const textOnly = await createChunk(
      "PORTARIA N.º 1.286/2026 - SEMED",
      vectorWith({ 7: 1 }),
    );
    const meaningOnly = await createChunk(
      "designação de servidora",
      vectorWith({ 0: 1, 1: 0.1 }),
    );
    const both = await createChunk(
      "PORTARIA N.º 1.286/2026 - SEMUS",
      vectorWith({ 0: 1 }),
    );

    const result = await ids("portaria 1286/2026", vectorWith({ 0: 1 }));

    expect(result[0]).toBe(both.id);
    expect(result.slice(1).sort()).toEqual(
      [textOnly.id, meaningOnly.id].sort(),
    );
  });

  it("falls back to the words when no chunk has a vector yet", async () => {
    const target = await createChunk("licitação de merenda escolar", null);
    await createChunk("nomeação de professor", null);

    expect(await ids("merenda", vectorWith({ 0: 1 }))).toEqual([target.id]);
  });

  it("falls back to the meaning when the question has only stop words", async () => {
    const near = await createChunk(
      "nomeação de professor",
      vectorWith({ 0: 1 }),
    );

    expect(await ids("de a o para", vectorWith({ 0: 1 }))).toEqual([near.id]);
  });

  it("fuses candidates beyond the limit, so a chunk in 4th place in both searches can win", async () => {
    for (let i = 0; i < 3; i++) {
      await createChunk(`designação ${i}`, vectorWith({ 0: 1, 1: i / 100 }));
    }
    for (const repeats of [5, 4, 3]) {
      await createChunk("merenda ".repeat(repeats), null);
    }
    const both = await createChunk(
      "merenda merenda",
      vectorWith({ 0: 1, 1: 0.5 }),
    );

    expect(await ids("merenda", vectorWith({ 0: 1 }), 3)).toEqual([
      both.id,
      expect.any(Number),
      expect.any(Number),
    ]);
  });

  it("stops at the limit", async () => {
    for (let i = 0; i < 6; i++) {
      await createChunk(`licitação ${i}`, vectorWith({ 0: 1, 1: i }));
    }

    expect(await ids("licitação", vectorWith({ 0: 1 }), 3)).toHaveLength(3);
  });

  it("returns nothing when the corpus is empty", async () => {
    expect(await ids("licitação", vectorWith({ 0: 1 }))).toEqual([]);
  });
});
