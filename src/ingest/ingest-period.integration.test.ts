import { mkdtemp, readdir, rm } from "node:fs/promises";
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
import { ingestPeriod } from "./ingest-period";
import type { PortalEdition } from "./portal-client";
import { buildPdf } from "./test-pdf";

const range = { from: "2026-07-01", to: "2026-09-30" };
const editions: PortalEdition[] = [1, 2, 3].map((number) => ({
  title: `Diário Oficial - Edição nº ${number}/XLVI`,
  date: `2026-07-0${number}`,
  pdfUrl: `https://diariooficial.saoluis.ma.gov.br/uploads/${number}.pdf`,
}));

describe("ingestPeriod", () => {
  let testDb: Awaited<ReturnType<typeof startTestDatabase>>;
  let tempRoot: string;
  let pdfDir: string;

  beforeAll(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "period-test-"));
    testDb = await startTestDatabase();
  }, 180_000);

  beforeEach(async () => {
    await testDb.db.edition.deleteMany();
    await testDb.db.territory.deleteMany();
    pdfDir = await mkdtemp(path.join(tempRoot, "pdfs-"));
  });

  afterAll(async () => {
    await testDb?.stop();
    await rm(tempRoot, { recursive: true, force: true });
  });

  // cada edição tem páginas diferentes, então o conteúdo (e o hash) também difere
  const portalWith = (failing: string[] = []) => ({
    listEditions: vi.fn(async () => editions),
    downloadPdf: vi.fn(async (url: string) => {
      if (failing.includes(url)) throw new Error("Portal answered 522");
      return buildPdf(editions.findIndex((e) => e.pdfUrl === url) + 1);
    }),
  });

  const run = (portal: ReturnType<typeof portalWith>, force = false) =>
    ingestPeriod({ db: testDb.db, portal, pdfDir }, range, { force });

  it("creates the territory and ingests every listed edition", async () => {
    const summary = await run(portalWith());

    expect(summary).toEqual({
      listed: 3,
      processed: 3,
      unchanged: 0,
      skipped: 0,
      failed: [],
    });
    expect(
      await testDb.db.territory.findMany({
        select: { ibgeCode: true, uf: true },
      }),
    ).toEqual([{ ibgeCode: "2111300", uf: "MA" }]);
    const pages = await testDb.db.edition.findMany({
      orderBy: { date: "asc" },
      select: { pageCount: true },
    });
    expect(pages.map((edition) => edition.pageCount)).toEqual([1, 2, 3]);
    expect(await readdir(pdfDir)).toHaveLength(3);
  });

  it("does not download anything again on a second run", async () => {
    const portal = portalWith();
    await run(portal);
    portal.downloadPdf.mockClear();

    const summary = await run(portal);

    expect(summary).toMatchObject({ processed: 0, skipped: 3, failed: [] });
    expect(portal.downloadPdf).not.toHaveBeenCalled();
    expect(await testDb.db.edition.count()).toBe(3);
    expect(await testDb.db.territory.count()).toBe(1);
  });

  it("reports the failed edition, finishes the others, and a rerun only retries the failed one", async () => {
    const broken = editions[1]!.pdfUrl;
    const first = await run(portalWith([broken]));

    expect(first).toMatchObject({ processed: 2, failed: [editions[1]!.title] });
    expect(
      await testDb.db.edition.findUniqueOrThrow({
        where: { sourceUrl: broken },
      }),
    ).toMatchObject({ status: "FAILED", failureReason: "Portal answered 522" });

    const healthy = portalWith();
    const second = await run(healthy);

    expect(second).toMatchObject({ processed: 1, skipped: 2, failed: [] });
    expect(healthy.downloadPdf).toHaveBeenCalledTimes(1);
    expect(healthy.downloadPdf).toHaveBeenCalledWith(broken);
  });

  it("downloads again when the PDF file is no longer on disk", async () => {
    const portal = portalWith();
    await run(portal);
    await rm(pdfDir, { recursive: true });
    portal.downloadPdf.mockClear();

    const summary = await run(portal);

    expect(summary).toMatchObject({ unchanged: 3, skipped: 0 });
    expect(portal.downloadPdf).toHaveBeenCalledTimes(3);
    expect(await readdir(pdfDir)).toHaveLength(3);
  });

  it("downloads everything again with force, without changing the editions", async () => {
    const portal = portalWith();
    await run(portal);

    const summary = await run(portal, true);

    expect(summary).toMatchObject({ unchanged: 3, skipped: 0, processed: 0 });
    expect(await testDb.db.edition.count()).toBe(3);
  });
});
