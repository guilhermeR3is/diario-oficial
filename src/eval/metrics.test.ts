import { describe, expect, it } from "vitest";
import {
  bootstrapInterval,
  differences,
  firstRelevantRank,
  mean,
  reciprocalRankScores,
  recallScores,
} from "./metrics";

const url = (n: number) => `https://exemplo.test/${n}.pdf`;
const hit = (edition: number, ordinal: number) => ({
  ordinal,
  edition: { sourceUrl: url(edition) },
});

describe("firstRelevantRank", () => {
  const relevant = [
    { sourceUrl: url(1), ordinal: 4 },
    { sourceUrl: url(2), ordinal: 7 },
  ];

  it("returns the position, counted from 1, of the first relevant chunk", () => {
    expect(firstRelevantRank([hit(9, 0), hit(2, 7), hit(1, 4)], relevant)).toBe(
      2,
    );
  });

  it("returns null when no relevant chunk appears", () => {
    expect(firstRelevantRank([hit(9, 0), hit(1, 5)], relevant)).toBeNull();
    expect(firstRelevantRank([], relevant)).toBeNull();
  });

  it("matches on the edition and the ordinal together, never on the ordinal alone", () => {
    expect(firstRelevantRank([hit(3, 4), hit(1, 7)], relevant)).toBeNull();
  });

  it("finds nothing for a question with no relevant chunk", () => {
    expect(firstRelevantRank([hit(1, 4)], [])).toBeNull();
  });
});

describe("recallScores", () => {
  it("scores 1 only when the first relevant chunk is in the top 5", () => {
    expect(recallScores([1, 5, 6, 10, null])).toEqual([1, 1, 0, 0, 0]);
  });

  it("accepts another cut", () => {
    expect(recallScores([1, 3, 4], 3)).toEqual([1, 1, 0]);
  });
});

describe("reciprocalRankScores", () => {
  it("scores 1 / position, and 0 when the chunk did not appear", () => {
    expect(reciprocalRankScores([1, 2, 4, 10, null])).toEqual([
      1, 0.5, 0.25, 0.1, 0,
    ]);
  });
});

describe("mean and differences", () => {
  it("averages", () => {
    expect(mean([1, 0, 0.5, 0.5])).toBe(0.5);
  });

  it("subtracts question by question", () => {
    expect(differences([1, 0.5, 0], [0, 0.5, 1])).toEqual([1, 0, -1]);
  });
});

describe("bootstrapInterval", () => {
  const half = (n: number) =>
    Array.from({ length: n }, (_, i) => (i % 2 === 0 ? 1 : 0));

  it("collapses to the value when every question scores the same", () => {
    expect(bootstrapInterval([0.5, 0.5, 0.5, 0.5])).toEqual([0.5, 0.5]);
    expect(bootstrapInterval(new Array(35).fill(1))).toEqual([1, 1]);
  });

  it("gives the same interval on every run, even for scores that take many values", () => {
    const reciprocals = Array.from({ length: 35 }, (_, i) => 1 / (i + 1));

    expect(bootstrapInterval(reciprocals)).toEqual(
      bootstrapInterval(reciprocals),
    );
  });

  it("brackets the mean", () => {
    const [low, high] = bootstrapInterval(half(40));

    expect(low).toBeLessThan(0.5);
    expect(high).toBeGreaterThan(0.5);
    expect(low).toBeGreaterThan(0.3);
    expect(high).toBeLessThan(0.7);
  });

  it("is wider with fewer questions", () => {
    const width = (scores: number[]) => {
      const [low, high] = bootstrapInterval(scores);
      return high - low;
    };

    expect(width(half(8))).toBeGreaterThan(width(half(400)));
  });
});
