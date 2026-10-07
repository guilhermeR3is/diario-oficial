import { EMBEDDING_MODEL } from "@/embedding/model";
import type { PrismaClient } from "../../generated/prisma/client";

export async function assertAllChunksHaveTheModelVector(db: PrismaClient) {
  const [row] = await db.$queryRaw<{ missing: number }[]>`
    SELECT count(*)::int AS missing FROM chunk
    WHERE embedding IS NULL OR embedding_model IS DISTINCT FROM ${EMBEDDING_MODEL}`;
  if (row!.missing > 0) {
    throw new Error(
      `${row!.missing} trechos sem o vetor de ${EMBEDDING_MODEL}: rode pnpm embed antes`,
    );
  }
}
