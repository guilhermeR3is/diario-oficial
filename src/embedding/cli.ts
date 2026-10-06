import "dotenv/config";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { parseEmbedArgs } from "./args";
import { embedChunks } from "./embed-chunks";
import { loadEmbedder } from "./gte-embedder";
import { EMBEDDING_MODEL } from "./model";

async function main() {
  const { force, limit } = parseEmbedArgs(process.argv.slice(2));
  const context = {
    db,
    model: EMBEDDING_MODEL,
    loadEmbed: loadEmbedder,
  };

  const summary = await embedChunks(context, { force, limit });
  if (summary.failed.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    logger.error({ err: error }, "embedding crashed");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
