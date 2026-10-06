export type SearchHit = {
  chunkId: number;
  score: number;
  actType: string;
  title: string;
  secretariat: string | null;
  date: string;
  page: number;
  pageEnd: number;
  text: string;
  edition: { id: number; title: string; sourceUrl: string };
};

export type HitRow = {
  score: number;
  chunk_id: number;
  act_type: string;
  title: string;
  secretariat: string | null;
  date: Date;
  page: number;
  page_end: number;
  text: string;
  edition_id: number;
  edition_title: string;
  source_url: string;
};

export function toSearchHit(row: HitRow): SearchHit {
  return {
    chunkId: row.chunk_id,
    score: row.score,
    actType: row.act_type,
    title: row.title,
    secretariat: row.secretariat,
    date: row.date.toISOString().slice(0, 10),
    page: row.page,
    pageEnd: row.page_end,
    text: row.text,
    edition: {
      id: row.edition_id,
      title: row.edition_title,
      sourceUrl: row.source_url,
    },
  };
}
