import { logger } from "@/lib/logger";
import type { PrismaClient } from "../../generated/prisma/client";
import type { Embed } from "./gte-embedder";

export type EmbedContext = {
  db: PrismaClient;
  model: string;
  // só é chamado se houver trecho pendente, para não carregar o modelo à toa
  loadEmbed: () => Promise<Embed>;
};

export type EmbedSummary = {
  pending: number;
  embedded: number;
  failed: number[];
};

const PROGRESS_EVERY = 100;

export async function embedChunks(
  { db, model, loadEmbed }: EmbedContext,
  { force = false, limit }: { force?: boolean; limit?: number } = {},
): Promise<EmbedSummary> {
  const pending = await db.$queryRaw<{ id: number; text: string }[]>`
    SELECT id, text FROM chunk
    WHERE ${force}::boolean OR embedding IS NULL OR embedding_model IS DISTINCT FROM ${model}
    ORDER BY id
    LIMIT ${limit ?? null}`;

  const summary: EmbedSummary = {
    pending: pending.length,
    embedded: 0,
    failed: [],
  };
  if (pending.length === 0) {
    logger.info(summary, "no chunk is waiting for a vector");
    return summary;
  }

  const embed = await loadEmbed();
  for (const chunk of pending) {
    const vector = await embedWithRetry(embed, chunk);
    if (vector === null) {
      summary.failed.push(chunk.id);
      continue;
    }
    // erro do banco (dimensão errada, conexão) sobe: continuar só repetiria o mesmo erro
    await db.$executeRaw`UPDATE chunk SET embedding = ${`[${vector.join(",")}]`}::vector, embedding_model = ${model} WHERE id = ${chunk.id}`;
    summary.embedded++;

    if (summary.embedded % PROGRESS_EVERY === 0) {
      logger.info(
        { embedded: summary.embedded, pending: pending.length },
        "embedding progress",
      );
    }
  }

  logger.info(
    { ...summary, failed: summary.failed.length },
    "embedding finished",
  );
  return summary;
}

async function embedWithRetry(
  embed: Embed,
  chunk: { id: number; text: string },
) {
  for (const attempt of [1, 2]) {
    try {
      return await embed(chunk.text);
    } catch (error) {
      logger.warn(
        { err: error, chunkId: chunk.id, attempt },
        "embedding failed",
      );
    }
  }
  return null;
}
