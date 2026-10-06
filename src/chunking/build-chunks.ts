import { classifyAct, secretariatOf, type ActType } from "./classify-act";
import type { Act } from "./segment-edition";
import { splitAct } from "./split-act";

export type ChunkDraft = {
  ordinal: number;
  actType: ActType;
  title: string;
  secretariat: string | null;
  date: Date;
  page: number;
  pageEnd: number;
  text: string;
  tokenCount: number;
  contentHash: string;
};

type EditionInfo = { date: Date; contentHash: string };

// estimativa de 4 caracteres por token; a contagem real depende do modelo de embeddings
const CHARS_PER_TOKEN = 4;

export function buildChunks(acts: Act[], edition: EditionInfo): ChunkDraft[] {
  const drafts: ChunkDraft[] = [];

  for (const act of acts) {
    const actType = classifyAct(act.title);
    const secretariat = secretariatOf(act.section);

    for (const piece of splitAct(act.parts)) {
      drafts.push({
        ordinal: drafts.length,
        actType,
        title: act.title,
        secretariat,
        date: edition.date,
        ...piece,
        tokenCount: Math.ceil(piece.text.length / CHARS_PER_TOKEN),
        contentHash: edition.contentHash,
      });
    }
  }

  return drafts;
}
