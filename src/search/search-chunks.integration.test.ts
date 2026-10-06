import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestDatabase } from "@/test/database";
import { searchChunks } from "./search-chunks";

const DIMENSIONS = 768;

function vectorWith(nonZero: Record<number, number>) {
  const values = new Array<number>(DIMENSIONS).fill(0);
  for (const [position, value] of Object.entries(nonZero)) {
    values[Number(position)] = value;
  }
  return values;
}

describe("searchChunks", () => {
  let testDb: Awaited<ReturnType<typeof startTestDatabase>>;
  let db: typeof testDb.db;
  let editionId: number;
  let ordinal: number;

  const createChunk = async (
    vector: number[] | null,
    text = "texto do trecho",
  ) => {
    const chunk = await db.chunk.create({
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
    if (vector) {
      const literal = `[${vector.join(",")}]`;
      await db.$executeRaw`UPDATE chunk SET embedding = ${literal}::vector, embedding_model = 'modelo-de-teste' WHERE id = ${chunk.id}`;
    }
    return chunk;
  };

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

  it("returns the nearest chunks first, with the cosine similarity as the score", async () => {
    const sameDirectionFar = await createChunk(vectorWith({ 0: 100 }));
    const slightlyOff = await createChunk(vectorWith({ 0: 0.9, 1: 0.3 }));
    const perpendicular = await createChunk(vectorWith({ 1: 1 }));

    const hits = await searchChunks(db, vectorWith({ 0: 1 }), 10);

    expect(hits.map((hit) => hit.chunkId)).toEqual([
      sameDirectionFar.id,
      slightlyOff.id,
      perpendicular.id,
    ]);
    expect(hits[0]!.score).toBeCloseTo(1, 5);
    expect(hits[1]!.score).toBeCloseTo(0.9 / Math.hypot(0.9, 0.3), 5);
    expect(hits[2]!.score).toBeCloseTo(0, 5);
  });

  it("returns what is needed to cite the chunk", async () => {
    const { id } = await createChunk(
      vectorWith({ 0: 1 }),
      "Art. 1º Fica designada...",
    );

    const [hit] = await searchChunks(db, vectorWith({ 0: 1 }), 10);

    expect(hit).toMatchObject({
      chunkId: id,
      actType: "PORTARIA",
      secretariat: "SEMED",
      date: "2026-09-30",
      page: 4,
      pageEnd: 5,
      text: "Art. 1º Fica designada...",
      edition: {
        id: editionId,
        title: "Diário Oficial - Edição nº 230/XLVI",
        sourceUrl: "https://exemplo.test/230.pdf",
      },
    });
  });

  it("stops at the limit", async () => {
    for (let i = 0; i < 5; i++) await createChunk(vectorWith({ 0: 1, 1: i }));

    const hits = await searchChunks(db, vectorWith({ 0: 1 }), 2);

    expect(hits).toHaveLength(2);
  });

  it("ignores the chunks that have no vector", async () => {
    const withVector = await createChunk(vectorWith({ 0: 1 }));
    await createChunk(null);

    const hits = await searchChunks(db, vectorWith({ 0: 1 }), 10);

    expect(hits.map((hit) => hit.chunkId)).toEqual([withVector.id]);
  });

  it("returns nothing when no chunk has a vector yet", async () => {
    await createChunk(null);

    expect(await searchChunks(db, vectorWith({ 0: 1 }), 10)).toEqual([]);
  });

  it("orders equally near chunks by id, so the answer does not change between runs", async () => {
    const first = await createChunk(vectorWith({ 0: 1 }));
    const second = await createChunk(vectorWith({ 0: 1 }));
    // regravar o vetor leva o primeiro trecho para o fim da tabela, onde uma ordem sem desempate o poria depois
    await db.$executeRaw`UPDATE chunk SET embedding = ${`[${vectorWith({ 0: 1 }).join(",")}]`}::vector WHERE id = ${first.id}`;

    const hits = await searchChunks(db, vectorWith({ 0: 1 }), 10);

    expect(hits.map((hit) => hit.chunkId)).toEqual([first.id, second.id]);
  });
});
