import { z } from "zod";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "@/embedding/model";
import { logger } from "@/lib/logger";
import type { PrismaClient } from "../../generated/prisma/client";
import { searchChunks } from "./search-chunks";
import type { SearchHit } from "./search-hit";

const RESULT_LIMIT = 10;

export const searchRequestSchema = z.object({
  model: z.literal(EMBEDDING_MODEL),
  vector: z
    .array(z.number())
    .length(EMBEDDING_DIMENSIONS)
    // o cosseno de um vetor zerado não existe e bagunçaria a ordem
    .refine((vector) => vector.some((value) => value !== 0), {
      message: "vector must not be all zeros",
    }),
});

export type SearchOutcome =
  | { status: 200; body: { model: string; results: SearchHit[] } }
  | { status: 400 | 500; body: { error: string } };

export async function handleSearchRequest(
  db: PrismaClient,
  payload: unknown,
): Promise<SearchOutcome> {
  const request = searchRequestSchema.safeParse(payload);
  if (!request.success) {
    return { status: 400, body: { error: z.prettifyError(request.error) } };
  }

  const startedAt = performance.now();
  try {
    const results = await searchChunks(db, request.data.vector, RESULT_LIMIT);
    logger.info(
      {
        results: results.length,
        durationMs: Math.round(performance.now() - startedAt),
      },
      "search finished",
    );
    return { status: 200, body: { model: EMBEDDING_MODEL, results } };
  } catch (error) {
    logger.error({ err: error }, "search failed");
    return { status: 500, body: { error: "search failed" } };
  }
}
