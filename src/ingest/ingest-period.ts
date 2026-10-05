import { access } from "node:fs/promises";
import path from "node:path";
import { logger } from "@/lib/logger";
import type { PrismaClient } from "../../generated/prisma/client";
import { ingestEdition } from "./ingest-edition";
import type { PortalClient, PortalEdition } from "./portal-client";

const SAO_LUIS = { ibgeCode: "2111300", name: "São Luís", uf: "MA" };

type PeriodContext = {
  db: PrismaClient;
  portal: Pick<PortalClient, "listEditions" | "downloadPdf">;
  pdfDir: string;
};

export type IngestSummary = {
  listed: number;
  processed: number;
  unchanged: number;
  skipped: number;
  failed: string[];
};

async function fileExists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

// uma edição só conta como pronta se o PDF dela ainda estiver em disco: a pasta data/ não vai para o git
async function findReadyEditions(
  { db, pdfDir }: PeriodContext,
  editions: PortalEdition[],
): Promise<Set<string>> {
  const processed = await db.edition.findMany({
    where: {
      sourceUrl: { in: editions.map((edition) => edition.pdfUrl) },
      status: "PROCESSED",
    },
    select: { sourceUrl: true, contentHash: true },
  });

  const ready = new Set<string>();
  for (const { sourceUrl, contentHash } of processed) {
    if (
      contentHash &&
      (await fileExists(path.join(pdfDir, `${contentHash}.pdf`)))
    ) {
      ready.add(sourceUrl);
    }
  }
  return ready;
}

export async function ingestPeriod(
  context: PeriodContext,
  range: { from: string; to: string },
  { force = false }: { force?: boolean } = {},
): Promise<IngestSummary> {
  const territory = await context.db.territory.upsert({
    where: { ibgeCode: SAO_LUIS.ibgeCode },
    create: SAO_LUIS,
    update: {},
  });

  const editions = await context.portal.listEditions(range);
  const ready = force
    ? new Set<string>()
    : await findReadyEditions(context, editions);
  const summary: IngestSummary = {
    listed: editions.length,
    processed: 0,
    unchanged: 0,
    skipped: 0,
    failed: [],
  };

  for (const edition of editions) {
    if (ready.has(edition.pdfUrl)) {
      summary.skipped++;
      continue;
    }

    const outcome = await ingestEdition(context, territory.id, edition);
    if (outcome === "failed") summary.failed.push(edition.title);
    else summary[outcome]++;
  }

  logger.info({ ...range, ...summary }, "ingestion finished");
  return summary;
}
