import { readFile } from "node:fs/promises";
import path from "node:path";
import { logger } from "@/lib/logger";
import type { PrismaClient } from "../../generated/prisma/client";
import { buildChunks } from "./build-chunks";
import { segmentEdition, type SegmentationProblem } from "./segment-edition";

export type ChunkContext = {
  db: PrismaClient;
  pdfDir: string;
  extractPages: (bytes: Uint8Array) => Promise<string[]>;
};

export type ChunkableEdition = {
  id: number;
  title: string;
  date: Date;
  contentHash: string;
  chunkProblems: unknown;
};

export type ChunkOutcome =
  | { status: "chunked"; chunks: number; problems: SegmentationProblem[] }
  | { status: "unchanged" }
  | { status: "failed" };

// sem marca de corte, ou com trechos de um PDF que já foi trocado
async function needsChunking(
  db: PrismaClient,
  edition: ChunkableEdition,
): Promise<boolean> {
  if (edition.chunkProblems === null) return true;
  const stale = await db.chunk.count({
    where: { editionId: edition.id, NOT: { contentHash: edition.contentHash } },
  });
  return stale > 0;
}

async function cutEdition(
  { pdfDir, extractPages }: ChunkContext,
  edition: ChunkableEdition,
) {
  const bytes = await readFile(path.join(pdfDir, `${edition.contentHash}.pdf`));
  const { acts, problems } = segmentEdition(await extractPages(bytes));
  const chunks = buildChunks(acts, {
    date: edition.date,
    contentHash: edition.contentHash,
  });
  return { chunks, problems };
}

export async function chunkEdition(
  context: ChunkContext,
  edition: ChunkableEdition,
  { force = false }: { force?: boolean } = {},
): Promise<ChunkOutcome> {
  const { db } = context;
  if (!force && !(await needsChunking(db, edition))) {
    return { status: "unchanged" };
  }

  let cut: Awaited<ReturnType<typeof cutEdition>>;
  try {
    cut = await cutEdition(context, edition);
  } catch (error) {
    logger.error({ err: error, title: edition.title }, "chunking failed");
    return { status: "failed" };
  }

  // troca os trechos de uma vez: se algo falhar, a edição continua com os trechos antigos
  await db.$transaction([
    db.chunk.deleteMany({ where: { editionId: edition.id } }),
    db.chunk.createMany({
      data: cut.chunks.map((chunk) => ({ ...chunk, editionId: edition.id })),
    }),
    db.edition.update({
      where: { id: edition.id },
      data: { chunkProblems: cut.problems },
    }),
  ]);

  if (cut.problems.length > 0) {
    logger.warn(
      { title: edition.title, problems: cut.problems },
      "edition chunked with problems, review it",
    );
  } else {
    logger.info(
      { title: edition.title, chunks: cut.chunks.length },
      "edition chunked",
    );
  }
  return {
    status: "chunked",
    chunks: cut.chunks.length,
    problems: cut.problems,
  };
}
