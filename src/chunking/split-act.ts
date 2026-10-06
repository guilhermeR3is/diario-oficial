import type { ActPart } from "./segment-edition";

export const MAX_CHARS = 3200;
export const OVERLAP_CHARS = 400;

export type ChunkPiece = { page: number; pageEnd: number; text: string };

type Limits = { maxChars: number; overlapChars: number };

const SENTENCE_END = /[.;:!?]["”')]?$/;

function pageAt(parts: ActPart[], offset: number): number {
  let start = 0;
  let page = parts[0]!.page;
  for (const part of parts) {
    if (offset < start) break;
    page = part.page;
    start += part.text.length + 1;
  }
  return page;
}

// prefere o fim de uma frase, depois um espaço; só corta no meio da palavra se não houver nenhum
function cutPoint(
  text: string,
  start: number,
  hardEnd: number,
  maxChars: number,
) {
  const floor = start + Math.floor(maxChars / 2);
  let lastSpace = -1;

  for (let i = hardEnd; i > floor; i--) {
    if (!/\s/.test(text[i]!)) continue;
    if (SENTENCE_END.test(text.slice(i - 2, i))) return i;
    if (lastSpace === -1) lastSpace = i;
  }
  return lastSpace === -1 ? hardEnd : lastSpace;
}

// recomeça no começo de uma palavra, sem passar de onde o trecho anterior terminou
function restartPoint(text: string, from: number, end: number): number {
  let i = from;
  while (i < end && !/\s/.test(text[i - 1] ?? " ")) i++;
  while (i < end && /\s/.test(text[i]!)) i++;
  return i;
}

export function splitAct(
  parts: ActPart[],
  { maxChars, overlapChars }: Limits = {
    maxChars: MAX_CHARS,
    overlapChars: OVERLAP_CHARS,
  },
): ChunkPiece[] {
  if (parts.length === 0) return [];
  const text = parts.map((part) => part.text).join("\n");
  const pieces: ChunkPiece[] = [];

  const addPiece = (start: number, end: number) => {
    const raw = text.slice(start, end);
    const trimmed = raw.trim();
    if (trimmed === "") return;
    const first = start + raw.length - raw.trimStart().length;
    pieces.push({
      page: pageAt(parts, first),
      pageEnd: pageAt(parts, first + trimmed.length - 1),
      text: trimmed,
    });
  };

  let start = 0;
  while (start + maxChars < text.length) {
    const end = cutPoint(text, start, start + maxChars, maxChars);
    addPiece(start, end);
    start = restartPoint(text, end - overlapChars, end);
  }
  addPiece(start, text.length);

  return pieces;
}
