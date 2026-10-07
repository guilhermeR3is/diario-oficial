import type { ChunkKey } from "./questions";

export const RECALL_AT = 5;

type HitKey = { ordinal: number; edition: { sourceUrl: string } };

const keyOf = ({ sourceUrl, ordinal }: ChunkKey) => `${sourceUrl}#${ordinal}`;

// posição (a partir de 1) do primeiro trecho relevante, ou null se nenhum aparece
export function firstRelevantRank(
  hits: HitKey[],
  relevant: ChunkKey[],
): number | null {
  const wanted = new Set(relevant.map(keyOf));
  const index = hits.findIndex((hit) =>
    wanted.has(
      keyOf({ sourceUrl: hit.edition.sourceUrl, ordinal: hit.ordinal }),
    ),
  );
  return index === -1 ? null : index + 1;
}

// o gabarito lista trechos sobrepostos e republicados: achar qualquer um deles conta como acerto
export const recallScores = (ranks: (number | null)[], k = RECALL_AT) =>
  ranks.map((rank) => (rank !== null && rank <= k ? 1 : 0));

export const reciprocalRankScores = (ranks: (number | null)[]) =>
  ranks.map((rank) => (rank === null ? 0 : 1 / rank));

export const mean = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

// gerador pseudoaleatório com semente, para o intervalo ser o mesmo a cada execução
function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BOOTSTRAP_ROUNDS = 10_000;
const BOOTSTRAP_SEED = 20261007;

// reamostra as perguntas com reposição; para comparar duas buscas, passa-se a diferença pergunta a pergunta
export function bootstrapInterval(scores: number[]): [number, number] {
  const random = seededRandom(BOOTSTRAP_SEED);
  const means: number[] = [];
  for (let round = 0; round < BOOTSTRAP_ROUNDS; round++) {
    let sum = 0;
    for (let i = 0; i < scores.length; i++) {
      sum += scores[Math.floor(random() * scores.length)]!;
    }
    means.push(sum / scores.length);
  }
  means.sort((a, b) => a - b);
  return [
    means[Math.floor(0.025 * BOOTSTRAP_ROUNDS)]!,
    means[Math.floor(0.975 * BOOTSTRAP_ROUNDS)]!,
  ];
}

export const differences = (a: number[], b: number[]) =>
  a.map((value, i) => value - b[i]!);
