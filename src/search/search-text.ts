import type { PrismaClient } from "../../generated/prisma/client";
import { toSearchHit, type HitRow, type SearchHit } from "./search-hit";

export async function searchText(
  db: PrismaClient,
  question: string,
  limit: number,
): Promise<SearchHit[]> {
  // E entre todos os termos esvazia a maioria das perguntas livres: o OU traz os candidatos e quem tem todos vai na frente
  // quem tem todos os termos é ordenado pelo rank do E, que mede a proximidade; o do OU trata cada termo isolado
  // o ts_rank_cd não se compara ao cosseno; a fusão (RRF) usa só a posição
  const rows = await db.$queryRaw<HitRow[]>`
    WITH terms AS (
      SELECT parsed.query AS every_term,
             replace(parsed.query::text, ' & ', ' | ')::tsquery AS any_term
      FROM (SELECT plainto_tsquery('portuguese', normalize_act_numbers(${question})) AS query) parsed
    ),
    ranked AS (
      SELECT c.id,
             c.tsv @@ t.every_term AS has_every_term,
             CASE WHEN c.tsv @@ t.every_term
                  THEN ts_rank_cd(c.tsv, t.every_term)
                  ELSE ts_rank_cd(c.tsv, t.any_term) END AS score
      FROM chunk c, terms t
      WHERE c.tsv @@ t.any_term
      ORDER BY has_every_term DESC, score DESC, c.id
      LIMIT ${limit}
    )
    SELECT r.score, c.id AS chunk_id, c.ordinal, c.act_type, c.title, c.secretariat, c.date,
           c.page, c.page_end, c.text,
           e.id AS edition_id, e.title AS edition_title, e.source_url
    FROM ranked r
    JOIN chunk c ON c.id = r.id
    JOIN edition e ON e.id = c.edition_id
    ORDER BY r.has_every_term DESC, r.score DESC, c.id`;

  return rows.map(toSearchHit);
}
