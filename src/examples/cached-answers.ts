import { z } from "zod";
import { isNotFound, parseCitations } from "@/generation/parse-citations";
import { toSearchHit, type HitRow, type SearchHit } from "@/search/search-hit";
import type { PrismaClient } from "../../generated/prisma/client";

export type ExampleQuestion = { slug: string; question: string };

export type ExampleAnswer = {
  slug: string;
  question: string;
  answer: string;
  citations: number[];
  notFound: boolean;
  sources: SearchHit[];
  generatedAt: string;
};

export const sourceKeysSchema = z.array(
  z.strictObject({ sourceUrl: z.string().min(1), ordinal: z.number().int() }),
);

export async function listExamples(
  db: PrismaClient,
): Promise<ExampleQuestion[]> {
  const rows = await db.cachedAnswer.findMany({
    orderBy: { position: "asc" },
    select: { questionSlug: true, question: true },
  });
  return rows.map((row) => ({
    slug: row.questionSlug,
    question: row.question,
  }));
}

export async function loadExample(
  db: PrismaClient,
  slug: string,
): Promise<ExampleAnswer | null> {
  const cached = await db.cachedAnswer.findUnique({
    where: { questionSlug: slug },
  });
  if (!cached) return null;

  const keys = sourceKeysSchema.parse(cached.citations);
  const rows = await db.$queryRaw<HitRow[]>`
    SELECT 0::float8 AS score, c.id AS chunk_id, c.ordinal, c.act_type, c.title,
           c.secretariat, c.date, c.page, c.page_end, c.text,
           e.id AS edition_id, e.title AS edition_title, e.source_url
    FROM chunk c
    JOIN edition e ON e.id = c.edition_id
    JOIN unnest(${keys.map((key) => key.sourceUrl)}::text[], ${keys.map((key) => key.ordinal)}::int[])
      AS wanted(source_url, ordinal)
      ON wanted.source_url = e.source_url AND wanted.ordinal = c.ordinal`;

  const byKey = new Map(
    rows.map((row) => [`${row.source_url}#${row.ordinal}`, toSearchHit(row)]),
  );
  const sources = keys.map((key) => {
    const hit = byKey.get(`${key.sourceUrl}#${key.ordinal}`);
    // trecho sumido quer dizer que o corte foi refeito depois de salvar a resposta: o exemplo precisa ser gerado de novo
    if (!hit) {
      throw new Error(
        `example ${slug} cites a missing chunk: ${key.sourceUrl} #${key.ordinal}`,
      );
    }
    return hit;
  });

  return {
    slug,
    question: cached.question,
    answer: cached.answer,
    citations: parseCitations(cached.answer, sources.length).cited,
    notFound: isNotFound(cached.answer),
    sources,
    generatedAt: cached.generatedAt.toISOString(),
  };
}
