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
import { ingestEdition } from "./ingest-edition";
import type { PortalEdition } from "./portal-client";
import { buildPdf } from "./test-pdf";

const edition: PortalEdition = {
  title: "Diário Oficial - Edição nº 230/XLVI Extra",
  date: "2026-09-30",
  pdfUrl: "https://diariooficial.saoluis.ma.gov.br/uploads/230.pdf",
};

describe("ingestEdition", () => {
  let testDb: Awaited<ReturnType<typeof startTestDatabase>>;
  let db: typeof testDb.db;
  let territoryId: number;
  let tempRoot: string;
  let pdfDir: string;

  beforeAll(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "ingest-test-"));
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
    pdfDir = await mkdtemp(path.join(tempRoot, "pdfs-"));
  });

  afterAll(async () => {
    await testDb?.stop();
    await rm(tempRoot, { recursive: true, force: true });
  });

  const portalReturning = (...pdfs: Uint8Array[]) => {
    const downloadPdf = vi.fn<(url: string) => Promise<Uint8Array>>();
    for (const pdf of pdfs) downloadPdf.mockResolvedValueOnce(pdf);
    return { downloadPdf };
  };

  it("stores the edition with hash and page count, and keeps the PDF named by its hash", async () => {
    const portal = portalReturning(buildPdf(4));

    const outcome = await ingestEdition(
      { db, portal, pdfDir },
      territoryId,
      edition,
    );

    const stored = await db.edition.findUniqueOrThrow({
      where: { sourceUrl: edition.pdfUrl },
    });
    expect(outcome).toBe("processed");
    expect(stored).toMatchObject({
      title: edition.title,
      status: "PROCESSED",
      pageCount: 4,
      failureReason: null,
    });
    expect(stored.date.toISOString().slice(0, 10)).toBe("2026-09-30");
    expect(await readdir(pdfDir)).toEqual([`${stored.contentHash}.pdf`]);
  });

  it("does nothing the second time when the content is the same", async () => {
    const pdf = buildPdf(2);
    const context = { db, portal: portalReturning(pdf, pdf), pdfDir };

    await ingestEdition(context, territoryId, edition);
    const outcome = await ingestEdition(context, territoryId, edition);

    expect(outcome).toBe("unchanged");
    expect(await db.edition.count()).toBe(1);
    expect(await readdir(pdfDir)).toHaveLength(1);
  });

  it("marks the edition as failed with the reason, and a later run recovers it", async () => {
    const portal = {
      downloadPdf: vi.fn<(url: string) => Promise<Uint8Array>>(),
    };
    portal.downloadPdf.mockRejectedValueOnce(new Error("Portal answered 522"));
    portal.downloadPdf.mockResolvedValueOnce(buildPdf(3));

    const first = await ingestEdition(
      { db, portal, pdfDir },
      territoryId,
      edition,
    );
    const failed = await db.edition.findUniqueOrThrow({
      where: { sourceUrl: edition.pdfUrl },
    });
    const second = await ingestEdition(
      { db, portal, pdfDir },
      territoryId,
      edition,
    );
    const recovered = await db.edition.findUniqueOrThrow({
      where: { sourceUrl: edition.pdfUrl },
    });

    expect(first).toBe("failed");
    expect(failed).toMatchObject({
      status: "FAILED",
      failureReason: "Portal answered 522",
      contentHash: null,
    });
    expect(second).toBe("processed");
    expect(recovered).toMatchObject({
      status: "PROCESSED",
      failureReason: null,
      pageCount: 3,
    });
    expect(await db.edition.count()).toBe(1);
  });

  it("marks a corrupt PDF as failed without keeping the file", async () => {
    const corrupt = new TextEncoder().encode("%PDF-1.4 lixo");

    const outcome = await ingestEdition(
      { db, portal: portalReturning(corrupt), pdfDir },
      territoryId,
      edition,
    );

    const stored = await db.edition.findUniqueOrThrow({
      where: { sourceUrl: edition.pdfUrl },
    });
    expect(outcome).toBe("failed");
    expect(stored.status).toBe("FAILED");
    expect(await readdir(pdfDir)).toEqual([]);
  });

  it("updates the hash and page count when the portal replaces the file", async () => {
    const context = {
      db,
      portal: portalReturning(buildPdf(2, "v1"), buildPdf(5, "v2")),
      pdfDir,
    };

    await ingestEdition(context, territoryId, edition);
    const before = await db.edition.findUniqueOrThrow({
      where: { sourceUrl: edition.pdfUrl },
    });
    const outcome = await ingestEdition(context, territoryId, edition);
    const after = await db.edition.findUniqueOrThrow({
      where: { sourceUrl: edition.pdfUrl },
    });

    expect(outcome).toBe("processed");
    expect(after.contentHash).not.toBe(before.contentHash);
    expect(after.pageCount).toBe(5);
    expect(await readdir(pdfDir)).toHaveLength(2);
  });
});
