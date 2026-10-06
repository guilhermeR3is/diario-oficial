import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDatabase } from "@/test/database";
import { buildChunks } from "./build-chunks";
import { chunkPeriod } from "./chunk-period";
import { segmentEdition } from "./segment-edition";
import { collectChunkStats } from "./stats";
import {
  insertFixtureEdition,
  loadFixtures,
  pagesFromStandIn,
} from "./test-fixtures";

const fixtures = loadFixtures();
const fixtureOf = (file: string) => fixtures.find((f) => f.file === file)!;
const chunked = [
  "edition-157.json",
  "edition-165.json",
  "edition-209.json",
].map(fixtureOf);
const untouched = fixtureOf("edition-190.json");

describe("collectChunkStats", () => {
  let testDb: Awaited<ReturnType<typeof startTestDatabase>>;
  let pdfDir: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    const { db } = testDb;
    const { id: territoryId } = await db.territory.create({
      data: { ibgeCode: "2111300", name: "São Luís", uf: "MA" },
    });
    pdfDir = await mkdtemp(path.join(tmpdir(), "chunk-stats-test-"));
    for (const fixture of [...chunked, untouched]) {
      await insertFixtureEdition(db, territoryId, fixture);
      await writeFile(
        path.join(pdfDir, `${fixture.contentHash}.pdf`),
        fixture.contentHash,
      );
    }
    // a edição 190 fica de fora do período: continua sem corte
    await chunkPeriod(
      { db, pdfDir, extractPages: pagesFromStandIn(fixtures) },
      { from: "2026-07-01", to: "2026-07-31" },
    );
    await chunkPeriod(
      { db, pdfDir, extractPages: pagesFromStandIn(fixtures) },
      { from: "2026-09-01", to: "2026-09-30" },
    );
  }, 180_000);

  afterAll(async () => {
    await testDb?.stop();
    await rm(pdfDir, { recursive: true, force: true });
  });

  const drafts = chunked.flatMap((fixture) =>
    buildChunks(segmentEdition(fixture.pages).acts, {
      date: new Date(fixture.date),
      contentHash: fixture.contentHash,
    }),
  );

  it("counts chunks, editions, suspect editions and editions still without a cut", async () => {
    const stats = await collectChunkStats(testDb.db);

    expect(stats).toMatchObject({
      chunks: drafts.length,
      editions: 3,
      suspectEditions: 1,
      editionsWithoutChunks: 1,
      invalidPages: 0,
    });
  });

  it("measures the size of the chunks", async () => {
    const { size } = await collectChunkStats(testDb.db);
    const lengths = drafts.map((draft) => draft.text.length);

    expect(size.min).toBe(Math.min(...lengths));
    expect(size.max).toBe(Math.max(...lengths));
    expect(size.mean).toBeCloseTo(
      lengths.reduce((a, b) => a + b, 0) / lengths.length,
      5,
    );
  });

  it("splits the chunks by act type, most common first", async () => {
    const { byType, chunks } = await collectChunkStats(testDb.db);

    expect(byType.reduce((sum, row) => sum + row.chunks, 0)).toBe(chunks);
    expect(byType.map((row) => row.chunks)).toEqual(
      [...byType.map((row) => row.chunks)].sort((a, b) => b - a),
    );
    const portarias = drafts.filter(
      (draft) => draft.actType === "PORTARIA",
    ).length;
    expect(byType.find((row) => row.actType === "PORTARIA")?.chunks).toBe(
      portarias,
    );
  });
});
