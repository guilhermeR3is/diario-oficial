import "dotenv/config";
import path from "node:path";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { parseIngestArgs } from "./args";
import { ingestPeriod } from "./ingest-period";
import { createPortalClient } from "./portal-client";

async function main() {
  const { range, force } = parseIngestArgs(process.argv.slice(2));
  const context = {
    db,
    portal: createPortalClient(),
    pdfDir: path.resolve("data/pdfs"),
  };

  const summary = await ingestPeriod(context, range, { force });
  if (summary.failed.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    logger.error({ err: error }, "ingestion crashed");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
