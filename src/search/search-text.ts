import type { PrismaClient } from "../../generated/prisma/client";
import { toSearchHit, type HitRow, type SearchHit } from "./search-hit";

export async function searchText(
  db: PrismaClient,
  question: string,
  limit: number,
): Promise<SearchHit[]> {
  // o ts_rank_cd não pesa a raridade: numa pergunta em frase o identificador raro valia o mesmo que "municipal"
  // aqui cada palavra da pergunta pesa pelo IDF do BM25 (palavra rara pesa mais) e o trecho soma o peso das que tem
  // o ts_rank_cd do E só desempata, porque mede a proximidade; o score não se compara ao cosseno, e a fusão (RRF) usa só a posição
  const rows = await db.$queryRaw<HitRow[]>`
    WITH words AS (
      SELECT lexeme,
             ('''' || replace(replace(lexeme, '\', '\\'), '''', '''''') || '''')::tsquery AS term
      FROM unnest(tsvector_to_array(
        to_tsvector('portuguese', normalize_act_numbers(${question})))) AS lexeme
    ),
    weights AS (
      SELECT words.term,
             ln(1 + (total.n - df.n + 0.5) / (df.n + 0.5)) AS weight
      FROM words
      CROSS JOIN (SELECT count(*)::float AS n FROM chunk) total
      CROSS JOIN LATERAL (
        SELECT count(*)::float AS n FROM chunk WHERE tsv @@ words.term
      ) df
    ),
    all_terms AS (
      SELECT plainto_tsquery('portuguese', normalize_act_numbers(${question})) AS query
    ),
    ranked AS (
      SELECT c.id,
             sum(w.weight) AS score,
             ts_rank_cd(c.tsv, e.query) AS closeness
      FROM chunk c
      JOIN weights w ON c.tsv @@ w.term
      CROSS JOIN all_terms e
      GROUP BY c.id, c.tsv, e.query
      ORDER BY score DESC, closeness DESC, c.id
      LIMIT ${limit}
    )
    SELECT r.score, c.id AS chunk_id, c.ordinal, c.act_type, c.title, c.secretariat, c.date,
           c.page, c.page_end, c.text,
           e.id AS edition_id, e.title AS edition_title, e.source_url
    FROM ranked r
    JOIN chunk c ON c.id = r.id
    JOIN edition e ON e.id = c.edition_id
    ORDER BY r.score DESC, r.closeness DESC, c.id`;

  return rows.map(toSearchHit);
}
