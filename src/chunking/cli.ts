import "dotenv/config";
import path from "node:path";
import { parseIngestArgs } from "@/ingest/args";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { chunkPeriod } from "./chunk-period";
import { extractPages } from "./extract-pages";

async function main() {
  const { range, force } = parseIngestArgs(process.argv.slice(2));
  const context = { db, pdfDir: path.resolve("data/pdfs"), extractPages };

  const summary = await chunkPeriod(context, range, { force });
  if (summary.failed.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    logger.error({ err: error }, "chunking crashed");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
