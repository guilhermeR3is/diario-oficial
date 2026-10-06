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
import { chunkPeriod } from "./chunk-period";
import { segmentEdition } from "./segment-edition";
import {
  insertFixtureEdition,
  loadFixtures,
  pagesFromStandIn,
  type EditionFixture,
  withBrokenTitle,
} from "./test-fixtures";

const fixtures = loadFixtures().map((fixture) =>
  fixture.file === "edition-157.json" ? withBrokenTitle(fixture) : fixture,
);
const fixtureOf = (file: string) => fixtures.find((f) => f.file === file)!;
const suspect = fixtureOf("edition-157.json"); // 2026-07-02
const julyEdition = fixtureOf("edition-165.json"); // 2026-07-10
const augustEdition = fixtureOf("edition-190.json"); // 2026-08-13
const septemberEdition = fixtureOf("edition-209.json"); // 2026-09-02

const chunkCount = (fixture: EditionFixture) =>
  buildChunks(segmentEdition(fixture.pages).acts, {
    date: new Date(fixture.date),
    contentHash: fixture.contentHash,
  }).length;

describe("chunkPeriod", () => {
  let testDb: Awaited<ReturnType<typeof startTestDatabase>>;
  let db: typeof testDb.db;
  let territoryId: number;
  let pdfDir: string;
  let extractPages: ReturnType<
    typeof vi.fn<(bytes: Uint8Array) => Promise<string[]>>
  >;

  const context = () => ({ db, pdfDir, extractPages });

  beforeAll(async () => {
    testDb = await startTestDatabase();
    db = testDb.db;
    territoryId = (
      await db.territory.create({
        data: { ibgeCode: "2111300", name: "São Luís", uf: "MA" },
      })
    ).id;
    pdfDir = await mkdtemp(path.join(tmpdir(), "chunk-period-test-"));
    for (const fixture of fixtures) {
      await writeFile(
        path.join(pdfDir, `${fixture.contentHash}.pdf`),
        fixture.contentHash,
      );
    }
  }, 180_000);

  beforeEach(async () => {
    await db.edition.deleteMany();
    extractPages = vi.fn(pagesFromStandIn(fixtures));
    for (const fixture of [
      suspect,
      julyEdition,
      augustEdition,
      septemberEdition,
    ]) {
      await insertFixtureEdition(db, territoryId, fixture);
    }
  });

  afterAll(async () => {
    await testDb?.stop();
    await rm(pdfDir, { recursive: true, force: true });
  });

  it("cuts the processed editions of the range, ends included, and summarizes them", async () => {
    const summary = await chunkPeriod(context(), {
      from: "2026-07-10",
      to: "2026-08-13",
    });

    expect(summary).toEqual({
      listed: 2,
      chunked: 2,
      unchanged: 0,
      chunks: chunkCount(julyEdition) + chunkCount(augustEdition),
      suspect: [],
      failed: [],
    });
  });

  it("lists the suspect editions in the summary", async () => {
    const summary = await chunkPeriod(context(), {
      from: "2026-07-01",
      to: "2026-09-30",
    });

    expect(summary.listed).toBe(4);
    expect(summary.suspect).toEqual([suspect.title]);
    expect(await db.chunk.count()).toBe(summary.chunks);
  });

  it("ignores editions that are not processed or have no hash", async () => {
    const base = {
      territoryId,
      date: new Date("2026-07-15"),
      title: "Edição de teste",
      contentHash: julyEdition.contentHash,
    };
    await db.edition.create({
      data: {
        ...base,
        sourceUrl: "https://exemplo.test/pending",
        status: "PENDING",
      },
    });
    await db.edition.create({
      data: {
        ...base,
        sourceUrl: "https://exemplo.test/failed",
        status: "FAILED",
        failureReason: "x",
      },
    });
    await db.edition.create({
      data: {
        ...base,
        sourceUrl: "https://exemplo.test/no-hash",
        status: "PROCESSED",
        contentHash: null,
      },
    });

    const summary = await chunkPeriod(context(), {
      from: "2026-07-11",
      to: "2026-07-20",
    });

    expect(summary.listed).toBe(0);
  });

  it("keeps going after a failure and names the edition that failed", async () => {
    await db.edition.create({
      data: {
        territoryId,
        title: "Edição sem PDF",
        date: new Date("2026-07-20"),
        sourceUrl: "https://exemplo.test/no-pdf",
        contentHash: "f".repeat(64),
        status: "PROCESSED",
      },
    });

    const summary = await chunkPeriod(context(), {
      from: "2026-07-01",
      to: "2026-09-30",
    });

    expect(summary.failed).toEqual(["Edição sem PDF"]);
    expect(summary.chunked).toBe(4);
  });

  it("does nothing on a second run", async () => {
    const range = { from: "2026-07-01", to: "2026-09-30" };
    await chunkPeriod(context(), range);
    extractPages.mockClear();

    const summary = await chunkPeriod(context(), range);

    expect(summary).toMatchObject({
      listed: 4,
      chunked: 0,
      unchanged: 4,
      chunks: 0,
    });
    expect(extractPages).not.toHaveBeenCalled();
  });

  it("redoes every edition with force", async () => {
    const range = { from: "2026-07-01", to: "2026-09-30" };
    const first = await chunkPeriod(context(), range);

    const again = await chunkPeriod(context(), range, { force: true });

    expect(again).toMatchObject({
      chunked: 4,
      unchanged: 0,
      chunks: first.chunks,
    });
    expect(await db.chunk.count()).toBe(first.chunks);
  });
});
