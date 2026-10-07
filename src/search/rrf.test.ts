import { describe, expect, it } from "vitest";
import { RRF_K, reciprocalRankFusion } from "./rrf";
import type { SearchHit } from "./search-hit";

const hit = (
  chunkId: number,
  score = 0.5,
  title = `ato ${chunkId}`,
): SearchHit => ({
  chunkId,
  ordinal: chunkId + 100,
  score,
  actType: "PORTARIA",
  title,
  secretariat: null,
  date: "2026-09-30",
  page: 1,
  pageEnd: 1,
  text: `texto ${chunkId}`,
  edition: { id: 1, title: "Edição", sourceUrl: "https://exemplo.test/1.pdf" },
});

const ids = (hits: SearchHit[]) => hits.map((h) => h.chunkId);

describe("reciprocalRankFusion", () => {
  it("uses 60 as the default constant", () => {
    expect(RRF_K).toBe(60);
  });

  it("scores a chunk by 1 / (k + position), summed over the rankings that have it", () => {
    const fused = reciprocalRankFusion([
      [hit(1), hit(2), hit(3)],
      [hit(9), hit(8), hit(1)],
    ]);

    const score = (id: number) => fused.find((h) => h.chunkId === id)!.score;
    expect(score(1)).toBeCloseTo(1 / 61 + 1 / 63, 12);
    expect(score(2)).toBeCloseTo(1 / 62, 12);
    expect(score(9)).toBeCloseTo(1 / 61, 12);
  });

  it("ranks a chunk that both rankings like above the first of only one", () => {
    const fused = reciprocalRankFusion([
      [hit(1), hit(2)],
      [hit(3), hit(2)],
    ]);

    expect(ids(fused)).toEqual([2, 1, 3]);
  });

  it("breaks equal scores by chunk id, so the result does not change between runs", () => {
    const fused = reciprocalRankFusion([[hit(7)], [hit(3)]]);

    expect(ids(fused)).toEqual([3, 7]);
  });

  it("replaces the score of each search with the fused one and keeps the data to cite", () => {
    const [fused] = reciprocalRankFusion([
      [hit(1, 0.93, "PORTARIA N.º 1/2026")],
      [hit(1, 12.5)],
    ]);

    expect(fused).toMatchObject({
      chunkId: 1,
      title: "PORTARIA N.º 1/2026",
      page: 1,
    });
    expect(fused!.score).toBeCloseTo(2 / 61, 12);
  });

  it("uses only the position, never the score of each search", () => {
    const small = reciprocalRankFusion([[hit(1, 0.001), hit(2, 0.0009)]]);
    const large = reciprocalRankFusion([[hit(1, 900), hit(2, 1)]]);

    expect(small.map((h) => h.score)).toEqual(large.map((h) => h.score));
  });

  it("lets the constant decide how much the top positions weigh", () => {
    const rankings = [
      [hit(1), hit(2), hit(3)],
      [hit(9), hit(8), hit(3)],
    ];

    expect(ids(reciprocalRankFusion(rankings, 60))[0]).toBe(3);
    expect(ids(reciprocalRankFusion(rankings, 0))[0]).toBe(1);
  });

  it("returns the other ranking as it is when one of them is empty", () => {
    expect(ids(reciprocalRankFusion([[], [hit(4), hit(2), hit(9)]]))).toEqual([
      4, 2, 9,
    ]);
    expect(ids(reciprocalRankFusion([[hit(4), hit(2)], []]))).toEqual([4, 2]);
  });

  it("returns nothing when there is nothing to fuse", () => {
    expect(reciprocalRankFusion([])).toEqual([]);
    expect(reciprocalRankFusion([[], []])).toEqual([]);
  });

  it("does not change the hits it receives", () => {
    const first = hit(1, 0.9);
    reciprocalRankFusion([[first], [hit(1, 0.4)]]);

    expect(first.score).toBe(0.9);
  });
});
