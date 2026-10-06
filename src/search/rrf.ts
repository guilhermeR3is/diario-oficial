import type { SearchHit } from "./search-hit";

// 60 é a constante do artigo original do RRF (Cormack et al., 2009)
export const RRF_K = 60;

export function reciprocalRankFusion(
  rankings: SearchHit[][],
  k: number = RRF_K,
): SearchHit[] {
  const fused = new Map<number, SearchHit>();

  for (const ranking of rankings) {
    ranking.forEach((hit, index) => {
      const contribution = 1 / (k + index + 1);
      const seen = fused.get(hit.chunkId);
      fused.set(hit.chunkId, {
        ...(seen ?? hit),
        score: (seen?.score ?? 0) + contribution,
      });
    });
  }

  // o score de cada busca (cosseno, ts_rank_cd) não se compara; só a posição entra na conta
  return [...fused.values()].sort(
    (a, b) => b.score - a.score || a.chunkId - b.chunkId,
  );
}
