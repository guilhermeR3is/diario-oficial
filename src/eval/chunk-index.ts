import type { PrismaClient } from "../../generated/prisma/client";
import type { IndexedChunk } from "./check-questions";

export async function loadChunkIndex(
  db: PrismaClient,
): Promise<IndexedChunk[]> {
  const rows = await db.chunk.findMany({
    select: {
      ordinal: true,
      page: true,
      title: true,
      text: true,
      edition: { select: { sourceUrl: true, title: true } },
    },
    orderBy: { id: "asc" },
  });

  return rows.map((row) => ({
    sourceUrl: row.edition.sourceUrl,
    ordinal: row.ordinal,
    page: row.page,
    title: row.title,
    editionTitle: row.edition.title,
    text: row.text,
  }));
}
