import { describe, expect, it } from "vitest";
import { segmentEdition } from "./segment-edition";
import {
  MAX_CHARS,
  OVERLAP_CHARS,
  splitAct,
  type ChunkPiece,
} from "./split-act";
import { loadFixtures } from "./test-fixtures";

const SMALL = { maxChars: 100, overlapChars: 20 };

const sentences = (count: number) =>
  Array.from(
    { length: count },
    (_, i) => `Frase ${i} com palavras para encher.`,
  ).join(" ");

// letras sem espaço e sem repetição, para o indexOf de expectNoGaps achar a posição certa
function withoutRepetition(length: number): string {
  let seed = 12345;
  return Array.from({ length }, () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return "abcdefghijklmnopqrstuvwxyz"[(seed >> 16) % 26]!;
  }).join("");
}

// onde cada trecho começa no texto inteiro; confere que um trecho começa antes de o anterior acabar
function expectNoGaps(full: string, pieces: ChunkPiece[]) {
  let previousEnd = 0;
  let previousStart = -1;
  for (const piece of pieces) {
    const start = full.indexOf(piece.text, previousStart + 1);
    expect(start).toBeGreaterThan(previousStart);
    expect(start).toBeLessThanOrEqual(previousEnd);
    previousStart = start;
    previousEnd = start + piece.text.length;
  }
  expect(previousEnd).toBe(full.length);
}

describe("splitAct", () => {
  it("keeps a short act as one piece, with its first and last page", () => {
    const parts = [
      { page: 4, text: "curto" },
      { page: 5, text: "fim" },
    ];

    expect(splitAct(parts)).toEqual([
      { page: 4, pageEnd: 5, text: "curto\nfim" },
    ]);
  });

  it("returns nothing for an act with no text", () => {
    expect(splitAct([])).toEqual([]);
  });

  it("keeps an act of exactly the maximum size as one piece", () => {
    // com um espaço na metade de cima, onde um corte indevido aconteceria
    const text = `${"a".repeat(60)} ${"b".repeat(39)}`;

    expect(text).toHaveLength(SMALL.maxChars);
    expect(splitAct([{ page: 1, text }], SMALL)).toHaveLength(1);
  });

  it("splits a long act at sentence ends, within the limit and with overlap", () => {
    const text = sentences(14);

    const pieces = splitAct([{ page: 1, text }], SMALL);

    expect(pieces.length).toBeGreaterThan(3);
    for (const piece of pieces.slice(0, -1)) {
      expect(piece.text.length).toBeLessThanOrEqual(SMALL.maxChars);
      expect(piece.text.endsWith(".")).toBe(true);
    }
    expect(pieces[0]!.text.startsWith("Frase 0")).toBe(true);
    expect(pieces.at(-1)!.text.endsWith("encher.")).toBe(true);
    expectNoGaps(text, pieces);
  });

  it("overlaps neighbouring pieces by at most the overlap size", () => {
    const text = sentences(14);

    const pieces = splitAct([{ page: 1, text }], SMALL);

    const starts: number[] = [];
    for (const piece of pieces) {
      starts.push(text.indexOf(piece.text, (starts.at(-1) ?? -1) + 1));
    }
    pieces.slice(1).forEach((_, i) => {
      const overlap = starts[i]! + pieces[i]!.text.length - starts[i + 1]!;
      expect(overlap).toBeGreaterThan(0);
      expect(overlap).toBeLessThanOrEqual(SMALL.overlapChars);
    });
  });

  it("falls back to a space when there is no sentence end, never cutting a word", () => {
    const text = Array.from({ length: 40 }, (_, i) => `palavra${i}`).join(" ");

    const pieces = splitAct([{ page: 1, text }], SMALL);

    expect(pieces.length).toBeGreaterThan(2);
    for (const piece of pieces) {
      expect(piece.text.length).toBeLessThanOrEqual(SMALL.maxChars);
      expect(
        piece.text.split(" ").every((word) => /^palavra\d+$/.test(word)),
      ).toBe(true);
    }
    expectNoGaps(text, pieces);
  });

  it("cuts inside a word only when there is no space at all", () => {
    const text = withoutRepetition(250);

    const pieces = splitAct([{ page: 1, text }], SMALL);

    expect(pieces.map((piece) => piece.text.length)).toEqual([100, 100, 50]);
    expectNoGaps(text, pieces);
  });

  it("gives each piece the page where it starts and the page where it ends", () => {
    const parts = [
      { page: 7, text: "Primeira frase aqui." },
      { page: 8, text: "Segunda frase aqui." },
    ];

    expect(splitAct(parts, { maxChars: 30, overlapChars: 5 })).toEqual([
      { page: 7, pageEnd: 7, text: "Primeira frase aqui." },
      { page: 7, pageEnd: 8, text: "aqui.\nSegunda frase aqui." },
    ]);
  });

  it("uses 3200 characters with 400 of overlap by default", () => {
    expect([MAX_CHARS, OVERLAP_CHARS]).toEqual([3200, 400]);

    const text = sentences(220);
    const pieces = splitAct([{ page: 1, text }]);

    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.every((piece) => piece.text.length <= MAX_CHARS)).toBe(true);
    expectNoGaps(text, pieces);
  });
});

describe("splitAct on the single long edital", () => {
  const fixture = loadFixtures().find((f) => f.file === "edition-160.json")!;
  const [act] = segmentEdition(fixture.pages).acts;
  const full = act!.parts.map((part) => part.text).join("\n");
  const pieces = splitAct(act!.parts);

  it("covers the whole act with pieces within the limit", () => {
    expect(pieces.length).toBeGreaterThan(40);
    expect(pieces.every((piece) => piece.text.length <= MAX_CHARS)).toBe(true);
    expectNoGaps(full, pieces);
  });

  it("walks the pages from the second to the last page of the act", () => {
    expect(pieces[0]!.page).toBe(2);
    expect(pieces.at(-1)!.pageEnd).toBe(77);
    pieces.slice(1).forEach((piece, i) => {
      expect(piece.page).toBeGreaterThanOrEqual(pieces[i]!.page);
      expect(piece.pageEnd).toBeGreaterThanOrEqual(piece.page);
    });
  });
});
