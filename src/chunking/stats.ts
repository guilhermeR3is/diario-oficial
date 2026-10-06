import type { PrismaClient } from "../../generated/prisma/client";

export type ChunkStats = {
  chunks: number;
  editions: number;
  suspectEditions: number;
  editionsWithoutChunks: number;
  invalidPages: number;
  size: { mean: number; median: number; min: number; max: number };
  byType: { actType: string; chunks: number; meanChars: number }[];
};

type Totals = {
  chunks: number;
  editions: number;
  invalidPages: number;
  mean: number;
  median: number;
  min: number;
  max: number;
};

export async function collectChunkStats(db: PrismaClient): Promise<ChunkStats> {
  const [totals] = await db.$queryRaw<Totals[]>`
    SELECT count(*)::int AS chunks,
           count(DISTINCT edition_id)::int AS editions,
           count(*) FILTER (WHERE page < 1 OR page_end < page)::int AS "invalidPages",
           coalesce(avg(length(text)), 0)::float8 AS mean,
           coalesce(percentile_cont(0.5) WITHIN GROUP (ORDER BY length(text)), 0)::float8 AS median,
           coalesce(min(length(text)), 0)::int AS min,
           coalesce(max(length(text)), 0)::int AS max
    FROM chunk`;
  const byType = await db.$queryRaw<ChunkStats["byType"]>`
    SELECT act_type AS "actType",
           count(*)::int AS chunks,
           avg(length(text))::float8 AS "meanChars"
    FROM chunk
    GROUP BY act_type
    ORDER BY count(*) DESC, act_type`;
  const [editionState] = await db.$queryRaw<
    { suspect: number; unchunked: number }[]
  >`
    SELECT count(*) FILTER (WHERE jsonb_array_length(chunk_problems) > 0)::int AS suspect,
           count(*) FILTER (WHERE chunk_problems IS NULL)::int AS unchunked
    FROM edition
    WHERE status = 'PROCESSED'`;

  const { chunks, editions, invalidPages, mean, median, min, max } = totals!;
  return {
    chunks,
    editions,
    suspectEditions: editionState!.suspect,
    editionsWithoutChunks: editionState!.unchunked,
    invalidPages,
    size: { mean, median, min, max },
    byType,
  };
}

const number = (value: number) => Math.round(value).toLocaleString("pt-BR");
const percent = (part: number, total: number) =>
  total === 0
    ? "0,0%"
    : `${((part / total) * 100).toFixed(1).replace(".", ",")}%`;

export function formatChunkStats(stats: ChunkStats): string {
  const widest = Math.max(0, ...stats.byType.map((row) => row.actType.length));
  const rows = stats.byType.map(
    (row) =>
      `  ${row.actType.padEnd(widest)}  ${number(row.chunks).padStart(6)}  ${percent(row.chunks, stats.chunks).padStart(6)}  média ${number(row.meanChars)}`,
  );

  return [
    `Trechos: ${number(stats.chunks)} em ${number(stats.editions)} edições (${number(stats.suspectEditions)} suspeitas, ${number(stats.editionsWithoutChunks)} ainda sem corte)`,
    `Tamanho em caracteres: média ${number(stats.size.mean)}, mediana ${number(stats.size.median)}, mínimo ${number(stats.size.min)}, máximo ${number(stats.size.max)}`,
    `Trechos com página inválida: ${number(stats.invalidPages)}`,
    "Por tipo de ato:",
    ...rows,
    "",
  ].join("\n");
}
