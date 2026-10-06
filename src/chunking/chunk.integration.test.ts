import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestDatabase } from "@/test/database";
import { buildChunks, type ChunkDraft } from "./build-chunks";
import { segmentEdition } from "./segment-edition";
import { loadFixtures } from "./test-fixtures";

const fixture = loadFixtures().find((f) => f.file === "edition-209.json")!;
const drafts = buildChunks(segmentEdition(fixture.pages).acts, {
  date: new Date(fixture.date),
  contentHash: fixture.contentHash,
});

describe("chunk table", () => {
  let testDb: Awaited<ReturnType<typeof startTestDatabase>>;
  let db: typeof testDb.db;
  let territoryId: number;

  const createEdition = (sourceUrl: string) =>
    db.edition.create({
      data: {
        territoryId,
        title: fixture.title,
        date: new Date(fixture.date),
        sourceUrl,
        contentHash: fixture.contentHash,
        pageCount: fixture.pages.length,
        status: "PROCESSED",
      },
    });

  const rows = (editionId: number, chunks: ChunkDraft[] = drafts) =>
    chunks.map((chunk) => ({ ...chunk, editionId }));

  beforeAll(async () => {
    testDb = await startTestDatabase();
    db = testDb.db;
    territoryId = (
      await db.territory.create({
        data: { ibgeCode: "2111300", name: "São Luís", uf: "MA" },
      })
    ).id;
  }, 180_000);

  beforeEach(async () => {
    await db.edition.deleteMany();
  });

  afterAll(async () => {
    await testDb?.stop();
  });

  it("stores the chunks of a real edition and reads them back in order", async () => {
    const { id } = await createEdition("https://exemplo.test/209.pdf");

    await db.chunk.createMany({ data: rows(id) });
    const stored = await db.chunk.findMany({
      where: { editionId: id },
      orderBy: { ordinal: "asc" },
    });

    expect(drafts.length).toBeGreaterThan(10);
    expect(stored).toMatchObject(drafts);
  });

  it("lets two editions use the same ordinals", async () => {
    const first = await createEdition("https://exemplo.test/209.pdf");
    const second = await createEdition("https://exemplo.test/209-bis.pdf");

    await db.chunk.createMany({ data: rows(first.id) });
    await db.chunk.createMany({ data: rows(second.id) });

    expect(await db.chunk.count()).toBe(drafts.length * 2);
  });

  it("refuses two chunks with the same edition and ordinal", async () => {
    const { id } = await createEdition("https://exemplo.test/209.pdf");
    await db.chunk.create({ data: rows(id)[0]! });

    await expect(db.chunk.create({ data: rows(id)[0]! })).rejects.toMatchObject(
      { code: "P2002" },
    );
  });

  it("refuses a chunk of an edition that does not exist", async () => {
    await expect(
      db.chunk.create({ data: rows(999_999)[0]! }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("removes the chunks together with their edition", async () => {
    const { id } = await createEdition("https://exemplo.test/209.pdf");
    await db.chunk.createMany({ data: rows(id) });

    await db.edition.delete({ where: { id } });

    expect(await db.chunk.count()).toBe(0);
  });
});
