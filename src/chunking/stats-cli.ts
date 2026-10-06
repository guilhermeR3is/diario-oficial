import "dotenv/config";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { collectChunkStats, formatChunkStats } from "./stats";

async function main() {
  process.stdout.write(formatChunkStats(await collectChunkStats(db)));
}

main()
  .catch((error) => {
    logger.error({ err: error }, "chunk statistics failed");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
