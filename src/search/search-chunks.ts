import type { PrismaClient } from "../../generated/prisma/client";
import { toSearchHit, type HitRow, type SearchHit } from "./search-hit";

export async function searchChunks(
  db: PrismaClient,
  vector: number[],
  limit: number,
): Promise<SearchHit[]> {
  const literal = `[${vector.join(",")}]`;

  // a ordenação cara roda só sobre ids; o texto e a edição são buscados depois, para os poucos vencedores
  const rows = await db.$queryRaw<HitRow[]>`
    WITH nearest AS (
      SELECT id, 1 - (embedding <=> ${literal}::vector) AS score
      FROM chunk
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> ${literal}::vector
      LIMIT ${limit}
    )
    SELECT n.score, c.id AS chunk_id, c.act_type, c.title, c.secretariat, c.date,
           c.page, c.page_end, c.text,
           e.id AS edition_id, e.title AS edition_title, e.source_url
    FROM nearest n
    JOIN chunk c ON c.id = n.id
    JOIN edition e ON e.id = c.edition_id
    ORDER BY n.score DESC, c.id`;

  return rows.map(toSearchHit);
}
