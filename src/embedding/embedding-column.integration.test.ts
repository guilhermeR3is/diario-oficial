import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestDatabase } from "@/test/database";

const DIMENSIONS = 768;

function embeddingLiteral(nonZero: Record<number, number>) {
  const values = new Array<number>(DIMENSIONS).fill(0);
  for (const [position, value] of Object.entries(nonZero)) {
    values[Number(position)] = value;
  }
  return `[${values.join(",")}]`;
}

describe("chunk embedding column", () => {
  let testDb: Awaited<ReturnType<typeof startTestDatabase>>;
  let db: typeof testDb.db;
  let editionId: number;

  const createChunk = (ordinal: number) =>
    db.chunk.create({
      data: {
        editionId,
        ordinal,
        actType: "PORTARIA",
        title: `PORTARIA N.º ${ordinal}/2026`,
        date: new Date("2026-09-30"),
        page: 1,
        pageEnd: 1,
        text: `texto do trecho ${ordinal}`,
        tokenCount: 6,
        contentHash: "hash-da-edicao",
      },
    });

  const storeEmbedding = (chunkId: number, literal: string) =>
    db.$executeRaw`UPDATE chunk SET embedding = ${literal}::vector, embedding_model = 'modelo-de-teste' WHERE id = ${chunkId}`;

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
          title: "Diário Oficial - Edição nº 1/XLVI",
          date: new Date("2026-09-30"),
          sourceUrl: "https://exemplo.test/1.pdf",
        },
      })
    ).id;
  }, 180_000);

  beforeEach(async () => {
    await db.chunk.deleteMany();
  });

  afterAll(async () => {
    await testDb?.stop();
  });

  it("leaves a new chunk without a vector and without a model name", async () => {
    const { id } = await createChunk(0);

    const [row] = await db.$queryRaw<
      { has_vector: boolean; embedding_model: string | null }[]
    >`SELECT embedding IS NOT NULL AS has_vector, embedding_model FROM chunk WHERE id = ${id}`;

    expect(row).toEqual({ has_vector: false, embedding_model: null });
  });

  it("stores a vector of 768 numbers together with the model name", async () => {
    const { id } = await createChunk(0);

    await storeEmbedding(id, embeddingLiteral({ 0: 1 }));

    const [row] = await db.$queryRaw<
      { dimensions: number; embedding_model: string }[]
    >`SELECT vector_dims(embedding) AS dimensions, embedding_model FROM chunk WHERE id = ${id}`;
    expect(row).toEqual({
      dimensions: DIMENSIONS,
      embedding_model: "modelo-de-teste",
    });
  });

  it("refuses a vector with the wrong number of dimensions", async () => {
    const { id } = await createChunk(0);

    await expect(storeEmbedding(id, "[1,2,3]")).rejects.toThrow(
      /expected 768 dimensions, not 3/,
    );
  });

  it("orders chunks by cosine distance, ignoring the size of the vector", async () => {
    const sameDirectionFar = await createChunk(0);
    const slightlyOff = await createChunk(1);
    const perpendicular = await createChunk(2);
    await storeEmbedding(sameDirectionFar.id, embeddingLiteral({ 0: 100 }));
    await storeEmbedding(slightlyOff.id, embeddingLiteral({ 0: 0.9, 1: 0.3 }));
    await storeEmbedding(perpendicular.id, embeddingLiteral({ 1: 1 }));

    const nearest = await db.$queryRaw<
      { id: number }[]
    >`SELECT id FROM chunk WHERE embedding IS NOT NULL ORDER BY embedding <=> ${embeddingLiteral({ 0: 1 })}::vector LIMIT 3`;

    expect(nearest.map((row) => row.id)).toEqual([
      sameDirectionFar.id,
      slightlyOff.id,
      perpendicular.id,
    ]);
  });
});
