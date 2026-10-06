import type { PrismaClient } from "../../generated/prisma/client";
import { reciprocalRankFusion } from "./rrf";
import { searchChunks } from "./search-chunks";
import type { SearchHit } from "./search-hit";
import { searchText } from "./search-text";

// um trecho no 40º lugar de uma busca ainda pode subir se a outra também o achar
export const CANDIDATES_PER_RANKING = 50;

export async function searchHybrid(
  db: PrismaClient,
  query: { question: string; vector: number[] },
  limit: number,
): Promise<SearchHit[]> {
  const [byMeaning, byWords] = await Promise.all([
    searchChunks(db, query.vector, CANDIDATES_PER_RANKING),
    searchText(db, query.question, CANDIDATES_PER_RANKING),
  ]);

  return reciprocalRankFusion([byMeaning, byWords]).slice(0, limit);
}
