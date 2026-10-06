import { describe, expect, it } from "vitest";
import { formatChunkStats, type ChunkStats } from "./stats";

const stats: ChunkStats = {
  chunks: 7927,
  editions: 75,
  suspectEditions: 4,
  editionsWithoutChunks: 0,
  invalidPages: 0,
  size: { mean: 1943.4, median: 1857, min: 148, max: 3200 },
  byType: [
    { actType: "PORTARIA", chunks: 2855, meanChars: 1500.2 },
    { actType: "OUTRO", chunks: 441, meanChars: 2210 },
  ],
};

describe("formatChunkStats", () => {
  it("writes the totals, the sizes and one line per act type", () => {
    expect(formatChunkStats(stats).split("\n")).toEqual([
      "Trechos: 7.927 em 75 edições (4 suspeitas, 0 ainda sem corte)",
      "Tamanho em caracteres: média 1.943, mediana 1.857, mínimo 148, máximo 3.200",
      "Trechos com página inválida: 0",
      "Por tipo de ato:",
      "  PORTARIA   2.855   36,0%  média 1.500",
      "  OUTRO        441    5,6%  média 2.210",
      "",
    ]);
  });

  it("does not divide by zero when there are no chunks", () => {
    const empty: ChunkStats = {
      ...stats,
      chunks: 0,
      editions: 0,
      byType: [{ actType: "OUTRO", chunks: 0, meanChars: 0 }],
    };

    expect(formatChunkStats(empty)).toContain(
      "  OUTRO       0    0,0%  média 0",
    );
  });
});
