import { firstRelevantRank } from "./metrics";
import type { EvalQuestion } from "./questions";
import type { SearchHit } from "../search/search-hit";

export const METHODS = ["vector", "text", "hybrid"] as const;
export type Method = (typeof METHODS)[number];

// cada busca devolve os 10 primeiros: é onde o MRR olha e de onde o recall@5 sai
export const SEARCH_LIMIT = 10;

export type Searcher = (question: EvalQuestion) => Promise<SearchHit[]>;

export type RetrievalRun = {
  questions: EvalQuestion[];
  ranks: Record<Method, (number | null)[]>;
};

export async function runRetrieval(
  questions: EvalQuestion[],
  searchers: Record<Method, Searcher>,
): Promise<RetrievalRun> {
  // as perguntas sem resposta não têm trecho relevante; entram na avaliação de geração (Fase 6)
  const answerable = questions.filter(
    (question) => question.kind !== "unanswerable",
  );
  const ranks: RetrievalRun["ranks"] = { vector: [], text: [], hybrid: [] };

  for (const question of answerable) {
    for (const method of METHODS) {
      const hits = await searchers[method](question);
      ranks[method].push(firstRelevantRank(hits, question.relevant));
    }
  }

  return { questions: answerable, ranks };
}
