import { describe, expect, it, vi } from "vitest";
import type { SearchHit } from "../search/search-hit";
import type { EvalQuestion } from "./questions";
import {
  METHODS,
  runRetrieval,
  type Method,
  type Searcher,
} from "./run-retrieval";

const url = "https://exemplo.test/1.pdf";

const question = (
  id: string,
  kind: EvalQuestion["kind"],
  ordinal?: number,
): EvalQuestion => ({
  id,
  kind,
  question: `Pergunta ${id} com texto suficiente?`,
  relevant: ordinal === undefined ? [] : [{ sourceUrl: url, ordinal }],
  evidence: ordinal === undefined ? [] : ["frase de evidência"],
  absent: ordinal === undefined ? ["termo ausente"] : [],
});

const hitAt = (ordinal: number) =>
  ({ ordinal, edition: { sourceUrl: url } }) as SearchHit;

const searchers = (hitsByMethod: Record<Method, SearchHit[]>) =>
  Object.fromEntries(
    METHODS.map((method) => [
      method,
      vi.fn<Searcher>(async () => hitsByMethod[method]),
    ]),
  ) as Record<Method, ReturnType<typeof vi.fn<Searcher>>>;

describe("runRetrieval", () => {
  it("records, per search and per question, the position of the first relevant chunk", async () => {
    const run = await runRetrieval(
      [question("q01", "exact", 3), question("q02", "semantic", 8)],
      searchers({
        vector: [hitAt(0), hitAt(3)],
        text: [hitAt(3)],
        hybrid: [hitAt(5), hitAt(6)],
      }),
    );

    expect(run.ranks).toEqual({
      vector: [2, null],
      text: [1, null],
      hybrid: [null, null],
    });
  });

  it("leaves out the questions that have no answer", async () => {
    const all = searchers({ vector: [], text: [], hybrid: [] });

    const run = await runRetrieval(
      [
        question("q01", "exact", 1),
        question("q02", "unanswerable"),
        question("q03", "mixed", 2),
      ],
      all,
    );

    expect(run.questions.map((q) => q.id)).toEqual(["q01", "q03"]);
    expect(run.ranks.vector).toHaveLength(2);
    for (const method of METHODS) expect(all[method]).toHaveBeenCalledTimes(2);
  });

  it("asks each search the question of the gabarito", async () => {
    const all = searchers({ vector: [], text: [], hybrid: [] });
    const q = question("q01", "exact", 1);

    await runRetrieval([q], all);

    for (const method of METHODS) expect(all[method]).toHaveBeenCalledWith(q);
  });
});
