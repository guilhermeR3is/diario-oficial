import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { startTestDatabase } from "@/test/database";
import { embedChunks } from "./embed-chunks";
import type { Embed } from "./gte-embedder";

const MODEL = "modelo-de-teste";
const DIMENSIONS = 768;

const fakeVector = (text: string) =>
  Array.from({ length: DIMENSIONS }, (_, i) => (i === 0 ? text.length : 1));

describe("embedChunks", () => {
  let testDb: Awaited<ReturnType<typeof startTestDatabase>>;
  let db: typeof testDb.db;
  let editionId: number;

  const createChunks = async (count: number) => {
    for (let ordinal = 0; ordinal < count; ordinal++) {
      await db.chunk.create({
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
    }
  };

  const contextWith = (embed: Embed) => {
    const loadEmbed = vi.fn(async () => embed);
    return { context: { db, model: MODEL, loadEmbed }, loadEmbed };
  };

  const stored = () =>
    db.$queryRaw<
      { ordinal: number; has_vector: boolean; embedding_model: string | null }[]
    >`SELECT ordinal, embedding IS NOT NULL AS has_vector, embedding_model FROM chunk ORDER BY ordinal`;

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

  it("stores a vector and the model name for every chunk that has none", async () => {
    await createChunks(3);
    const { context } = contextWith(async (text) => fakeVector(text));

    const summary = await embedChunks(context);

    expect(summary).toEqual({ pending: 3, embedded: 3, failed: [] });
    expect(await stored()).toEqual([
      { ordinal: 0, has_vector: true, embedding_model: MODEL },
      { ordinal: 1, has_vector: true, embedding_model: MODEL },
      { ordinal: 2, has_vector: true, embedding_model: MODEL },
    ]);
  });

  it("does nothing, and does not even load the model, when no chunk is pending", async () => {
    await createChunks(2);
    await embedChunks(contextWith(async (text) => fakeVector(text)).context);

    const { context, loadEmbed } = contextWith(async (text) =>
      fakeVector(text),
    );
    const summary = await embedChunks(context);

    expect(summary).toEqual({ pending: 0, embedded: 0, failed: [] });
    expect(loadEmbed).not.toHaveBeenCalled();
  });

  it("embeds again the chunks whose vector came from another model", async () => {
    await createChunks(3);
    await embedChunks(contextWith(async (text) => fakeVector(text)).context);
    await db.$executeRaw`UPDATE chunk SET embedding_model = 'modelo-antigo' WHERE ordinal = 1`;
    const embed = vi.fn(async (text: string) => fakeVector(text));

    const summary = await embedChunks(contextWith(embed).context);

    expect(summary.embedded).toBe(1);
    expect(embed).toHaveBeenCalledExactlyOnceWith("texto do trecho 1");
    expect((await stored()).map((row) => row.embedding_model)).toEqual([
      MODEL,
      MODEL,
      MODEL,
    ]);
  });

  it("embeds everything again with force", async () => {
    await createChunks(3);
    await embedChunks(contextWith(async (text) => fakeVector(text)).context);
    const embed = vi.fn(async (text: string) => fakeVector(text));

    const summary = await embedChunks(contextWith(embed).context, {
      force: true,
    });

    expect(summary.embedded).toBe(3);
    expect(embed).toHaveBeenCalledTimes(3);
  });

  it("stops after the limit and leaves the rest pending", async () => {
    await createChunks(5);
    const { context } = contextWith(async (text) => fakeVector(text));

    const summary = await embedChunks(context, { limit: 2 });

    expect(summary).toEqual({ pending: 2, embedded: 2, failed: [] });
    expect((await stored()).map((row) => row.has_vector)).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
  });

  it("tries a failing chunk once more before giving up", async () => {
    await createChunks(2);
    let calls = 0;
    const { context } = contextWith(async (text) => {
      calls++;
      if (calls === 1) throw new Error("falha passageira");
      return fakeVector(text);
    });

    const summary = await embedChunks(context);

    expect(summary).toEqual({ pending: 2, embedded: 2, failed: [] });
    expect(calls).toBe(3);
  });

  it("reports a chunk that keeps failing, leaves it pending and embeds the others", async () => {
    await createChunks(3);
    const { context } = contextWith(async (text) => {
      if (text.endsWith("1")) throw new Error("trecho impossível");
      return fakeVector(text);
    });

    const summary = await embedChunks(context);

    const [broken] = await db.chunk.findMany({ where: { ordinal: 1 } });
    expect(summary).toEqual({ pending: 3, embedded: 2, failed: [broken!.id] });
    expect((await stored()).map((row) => row.has_vector)).toEqual([
      true,
      false,
      true,
    ]);
  });

  it("lets a database refusal go up instead of counting it as a failed chunk", async () => {
    await createChunks(2);
    const { context } = contextWith(async () => [1, 2, 3]);

    await expect(embedChunks(context)).rejects.toThrow(
      /expected 768 dimensions, not 3/,
    );
  });
});
