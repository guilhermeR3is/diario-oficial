import { logger } from "@/lib/logger";
import { chunkEdition, type ChunkContext } from "./chunk-edition";

export type ChunkSummary = {
  listed: number;
  chunked: number;
  unchanged: number;
  chunks: number;
  suspect: string[];
  failed: string[];
};

export async function chunkPeriod(
  context: ChunkContext,
  range: { from: string; to: string },
  { force = false }: { force?: boolean } = {},
): Promise<ChunkSummary> {
  const found = await context.db.edition.findMany({
    where: {
      status: "PROCESSED",
      contentHash: { not: null },
      date: { gte: new Date(range.from), lte: new Date(range.to) },
    },
    orderBy: [{ date: "asc" }, { title: "asc" }],
  });
  const editions = found.flatMap(({ contentHash, ...edition }) =>
    contentHash === null ? [] : [{ ...edition, contentHash }],
  );

  const summary: ChunkSummary = {
    listed: editions.length,
    chunked: 0,
    unchanged: 0,
    chunks: 0,
    suspect: [],
    failed: [],
  };

  for (const edition of editions) {
    const outcome = await chunkEdition(context, edition, { force });
    if (outcome.status === "failed") {
      summary.failed.push(edition.title);
    } else if (outcome.status === "unchanged") {
      summary.unchanged++;
    } else {
      summary.chunked++;
      summary.chunks += outcome.chunks;
      if (outcome.problems.length > 0) summary.suspect.push(edition.title);
    }
  }

  logger.info({ ...range, ...summary }, "chunking finished");
  return summary;
}
