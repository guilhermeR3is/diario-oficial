import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { logger } from "@/lib/logger";
import type { PrismaClient } from "../../generated/prisma/client";
import { countPages } from "./pdf";
import type { PortalClient, PortalEdition } from "./portal-client";

export type IngestOutcome = "processed" | "unchanged" | "failed";

type IngestContext = {
  db: PrismaClient;
  portal: Pick<PortalClient, "downloadPdf">;
  pdfDir: string;
};

async function fetchPdf(portal: IngestContext["portal"], url: string) {
  const bytes = await portal.downloadPdf(url);
  return {
    bytes,
    contentHash: createHash("sha256").update(bytes).digest("hex"),
    pageCount: await countPages(bytes),
  };
}

async function savePdf(file: string, bytes: Uint8Array) {
  try {
    await writeFile(file, bytes, { flag: "wx" });
  } catch (error) {
    // o nome é o hash do conteúdo, então um arquivo que já existe tem exatamente os mesmos bytes
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
}

export async function ingestEdition(
  { db, portal, pdfDir }: IngestContext,
  territoryId: number,
  edition: PortalEdition,
): Promise<IngestOutcome> {
  const date = new Date(edition.date);
  const stored = await db.edition.upsert({
    where: { sourceUrl: edition.pdfUrl },
    create: {
      territoryId,
      title: edition.title,
      date,
      sourceUrl: edition.pdfUrl,
    },
    update: { title: edition.title, date },
  });

  let pdf: Awaited<ReturnType<typeof fetchPdf>>;
  try {
    pdf = await fetchPdf(portal, edition.pdfUrl);
  } catch (error) {
    await db.edition.update({
      where: { id: stored.id },
      data: {
        status: "FAILED",
        failureReason: error instanceof Error ? error.message : String(error),
      },
    });
    logger.error(
      { err: error, sourceUrl: edition.pdfUrl },
      "edition ingestion failed",
    );
    return "failed";
  }

  await mkdir(pdfDir, { recursive: true });
  await savePdf(path.join(pdfDir, `${pdf.contentHash}.pdf`), pdf.bytes);

  if (stored.status === "PROCESSED" && stored.contentHash === pdf.contentHash) {
    return "unchanged";
  }

  await db.edition.update({
    where: { id: stored.id },
    data: {
      contentHash: pdf.contentHash,
      pageCount: pdf.pageCount,
      status: "PROCESSED",
      failureReason: null,
    },
  });
  logger.info(
    { title: edition.title, pages: pdf.pageCount },
    "edition ingested",
  );
  return "processed";
}
