import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
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
import { buildChunks } from "./build-chunks";
import { chunkEdition } from "./chunk-edition";
import { segmentEdition } from "./segment-edition";
import {
  insertFixtureEdition,
  loadFixtures,
  pagesFromStandIn,
  type EditionFixture,
} from "./test-fixtures";

const fixtures = loadFixtures();
const fixtureOf = (file: string) => fixtures.find((f) => f.file === file)!;
const clean = fixtureOf("edition-209.json");
const small = fixtureOf("edition-165.json");
const suspect = fixtureOf("edition-157.json");

const expectedChunks = (fixture: EditionFixture) =>
  buildChunks(segmentEdition(fixture.pages).acts, {
    date: new Date(fixture.date),
    contentHash: fixture.contentHash,
  });

describe("chunkEdition", () => {
  let testDb: Awaited<ReturnType<typeof startTestDatabase>>;
  let db: typeof testDb.db;
  let territoryId: number;
  let pdfDir: string;
  let extractPages: ReturnType<
    typeof vi.fn<(bytes: Uint8Array) => Promise<string[]>>
  >;

  const context = () => ({ db, pdfDir, extractPages });

  // relê a edição do banco, como o chunkPeriod faz, para ter a marca de corte atual
  const loadEdition = async (id: number, fixture: EditionFixture) => {
    const edition = await db.edition.findUniqueOrThrow({ where: { id } });
    return { ...edition, contentHash: fixture.contentHash };
  };

  beforeAll(async () => {
    testDb = await startTestDatabase();
    db = testDb.db;
    territoryId = (
      await db.territory.create({
        data: { ibgeCode: "2111300", name: "São Luís", uf: "MA" },
      })
    ).id;
    pdfDir = await mkdtemp(path.join(tmpdir(), "chunk-test-"));
    for (const fixture of [clean, small, suspect]) {
      await writeFile(
        path.join(pdfDir, `${fixture.contentHash}.pdf`),
        fixture.contentHash,
      );
    }
  }, 180_000);

  beforeEach(async () => {
    await db.edition.deleteMany();
    extractPages = vi.fn(pagesFromStandIn(fixtures));
  });

  afterAll(async () => {
    await testDb?.stop();
    await rm(pdfDir, { recursive: true, force: true });
  });

  it("stores the chunks of a clean edition and an empty problem list", async () => {
    const { id } = await insertFixtureEdition(db, territoryId, clean);

    const outcome = await chunkEdition(context(), await loadEdition(id, clean));

    const expected = expectedChunks(clean);
    expect(outcome).toEqual({
      status: "chunked",
      chunks: expected.length,
      problems: [],
    });
    expect(
      await db.chunk.findMany({
        where: { editionId: id },
        orderBy: { ordinal: "asc" },
      }),
    ).toMatchObject(expected);
    expect((await loadEdition(id, clean)).chunkProblems).toEqual([]);
  });

  it("cuts a suspect edition anyway and records its problems", async () => {
    const { id } = await insertFixtureEdition(db, territoryId, suspect);

    const outcome = await chunkEdition(
      context(),
      await loadEdition(id, suspect),
    );

    expect(outcome).toMatchObject({ status: "chunked" });
    expect(await db.chunk.count({ where: { editionId: id } })).toBe(
      expectedChunks(suspect).length,
    );
    expect((await loadEdition(id, suspect)).chunkProblems).toMatchObject([
      { kind: "title-not-found", page: 23 },
    ]);
  });

  it("skips an edition that was already cut from the same PDF", async () => {
    const { id } = await insertFixtureEdition(db, territoryId, clean);
    await chunkEdition(context(), await loadEdition(id, clean));

    const outcome = await chunkEdition(context(), await loadEdition(id, clean));

    expect(outcome).toEqual({ status: "unchanged" });
    expect(extractPages).toHaveBeenCalledTimes(1);
  });

  it("cuts again, without leftovers, when the PDF was replaced", async () => {
    const { id } = await insertFixtureEdition(db, territoryId, clean);
    await chunkEdition(context(), await loadEdition(id, clean));
    // o portal trocou o PDF: o ingest grava o hash novo na edição
    await db.edition.update({
      where: { id },
      data: { contentHash: small.contentHash },
    });

    const outcome = await chunkEdition(context(), await loadEdition(id, small));

    const expected = expectedChunks(small);
    expect(outcome).toMatchObject({
      status: "chunked",
      chunks: expected.length,
    });
    const stored = await db.chunk.findMany({ where: { editionId: id } });
    expect(stored).toHaveLength(expected.length);
    expect(
      stored.every((chunk) => chunk.contentHash === small.contentHash),
    ).toBe(true);
  });

  it("cuts again with force and does not duplicate the chunks", async () => {
    const { id } = await insertFixtureEdition(db, territoryId, clean);
    await chunkEdition(context(), await loadEdition(id, clean));

    const outcome = await chunkEdition(
      context(),
      await loadEdition(id, clean),
      {
        force: true,
      },
    );

    expect(outcome.status).toBe("chunked");
    expect(extractPages).toHaveBeenCalledTimes(2);
    expect(await db.chunk.count({ where: { editionId: id } })).toBe(
      expectedChunks(clean).length,
    );
  });

  it("reports a missing PDF and leaves the edition untouched", async () => {
    const { id } = await insertFixtureEdition(db, territoryId, clean);
    const lost = {
      ...(await loadEdition(id, clean)),
      contentHash: "0".repeat(64),
    };

    const outcome = await chunkEdition(context(), lost);

    expect(outcome).toEqual({ status: "failed" });
    expect(await db.chunk.count()).toBe(0);
    expect((await loadEdition(id, clean)).chunkProblems).toBeNull();
  });

  it("keeps the old chunks when a new cut fails", async () => {
    const { id } = await insertFixtureEdition(db, territoryId, clean);
    await chunkEdition(context(), await loadEdition(id, clean));
    extractPages.mockRejectedValueOnce(new Error("pdftotext exploded"));

    const outcome = await chunkEdition(
      context(),
      await loadEdition(id, clean),
      {
        force: true,
      },
    );

    expect(outcome).toEqual({ status: "failed" });
    expect(await db.chunk.count({ where: { editionId: id } })).toBe(
      expectedChunks(clean).length,
    );
  });

  it("reports an edition whose pages lost the newspaper footer", async () => {
    const { id } = await insertFixtureEdition(db, territoryId, clean);
    extractPages.mockResolvedValueOnce(["página sem rodapé"]);

    const outcome = await chunkEdition(context(), await loadEdition(id, clean));

    expect(outcome).toEqual({ status: "failed" });
    expect(await db.chunk.count()).toBe(0);
  });
});
