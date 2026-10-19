import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { QUESTION_SETS } from "@/eval/question-sets";
import { type EvalQuestion, parseQuestions } from "@/eval/questions";
import type { AnswerModel } from "@/generation/answer-model";
import { PROMPT_VERSION } from "@/generation/build-prompt";
import { createFakeAnswerModel } from "@/generation/fake-answer-model";
import type { SearchHit } from "@/search/search-hit";
import {
  EXAMPLES,
  type ExampleDeps,
  exampleQuestions,
  generateExamples,
} from "./generate-examples";

const hit = (ordinal: number, edition = 190): SearchHit => ({
  chunkId: ordinal * 10,
  ordinal,
  score: 0.5,
  actType: "LEI",
  title: `LEI Nº ${ordinal}/2026`,
  secretariat: "SEMED",
  date: "2026-08-14",
  page: 3,
  pageEnd: 3,
  text: `texto da lei ${ordinal}`,
  edition: {
    id: edition,
    title: `Edição ${edition}`,
    sourceUrl: `https://exemplo.test/${edition}.pdf`,
  },
});

const examples = [
  { slug: "primeira", question: "Primeira pergunta?" },
  { slug: "segunda", question: "Segunda pergunta?" },
  { slug: "terceira", question: "Terceira pergunta?" },
];

function deps(overrides: Partial<ExampleDeps> = {}) {
  return {
    model: createFakeAnswerModel("A lei saiu [1]."),
    vectorOf: vi.fn(async (question: string) => [question.length]),
    search: vi.fn(async () => [hit(7), hit(3, 191)]),
    sleep: vi.fn(async () => {}),
    now: () => new Date("2026-10-16T12:00:00Z"),
    ...overrides,
  };
}

describe("exampleQuestions", () => {
  const questions = Object.values(QUESTION_SETS).flatMap((set) =>
    parseQuestions(readFileSync(set.file, "utf8")),
  );
  const exampleIds = new Set<string>(
    EXAMPLES.map((example) => example.questionId),
  );

  it("takes the six examples, word for word, from the measured questions", () => {
    const chosen = exampleQuestions(questions);

    expect(chosen).toHaveLength(6);
    expect(new Set(chosen.map((example) => example.slug)).size).toBe(6);
    expect(chosen[0]).toEqual({
      slug: "merenda-escolar",
      question: questions.find((question) => question.id === "q11")?.question,
    });
  });

  // decisão do autor em 19/10/2026: o exemplo é a primeira coisa que o visitante clica e precisa ter resposta
  it("only shows questions the diaries answer", () => {
    const kinds = questions
      .filter((question) => exampleIds.has(question.id))
      .map((question) => question.kind);

    expect(kinds).toHaveLength(6);
    expect(kinds).not.toContain("unanswerable");
  });

  it("shows at least one fact from the months added later, January to June", () => {
    const janJun = new Set(
      parseQuestions(readFileSync(QUESTION_SETS["jan-jun"].file, "utf8")).map(
        (question) => question.id,
      ),
    );

    expect([...exampleIds].some((id) => janJun.has(id))).toBe(true);
  });

  it("fails when a chosen question no longer exists", () => {
    const withoutQ02 = questions.filter(
      (question: EvalQuestion) => question.id !== "q02",
    );

    expect(() => exampleQuestions(withoutQ02)).toThrow(/q02/);
  });
});

describe("generateExamples", () => {
  it("saves every source in prompt order, by its stable key, so [n] points to item n", async () => {
    const [first] = await generateExamples(examples.slice(0, 1), deps(), 0);

    expect(first).toEqual({
      questionSlug: "primeira",
      question: "Primeira pergunta?",
      answer: "A lei saiu [1].",
      citations: [
        { sourceUrl: "https://exemplo.test/190.pdf", ordinal: 7 },
        { sourceUrl: "https://exemplo.test/191.pdf", ordinal: 3 },
      ],
      model: "fake",
      promptVersion: PROMPT_VERSION,
      position: 1,
      generatedAt: new Date("2026-10-16T12:00:00Z"),
    });
  });

  it("searches with the vector of each question and numbers the examples in order", async () => {
    const run = deps();

    const generated = await generateExamples(examples, run, 0);

    expect(generated.map((example) => example.position)).toEqual([1, 2, 3]);
    expect(run.search).toHaveBeenNthCalledWith(2, {
      question: "Segunda pergunta?",
      vector: ["Segunda pergunta?".length],
    });
  });

  it("pauses between questions, not before the first, to stay under the per-minute limit", async () => {
    const run = deps();

    await generateExamples(examples, run, 60_000);

    expect(run.sleep).toHaveBeenCalledTimes(2);
    expect(run.sleep).toHaveBeenCalledWith(60_000);
  });

  it("stops at the first failure, so a half-generated set is never saved", async () => {
    let calls = 0;
    const flaky: AnswerModel = {
      name: "instável",
      async *stream() {
        calls += 1;
        if (calls === 2) throw new Error("falha");
        yield "Saiu [1].";
        return undefined;
      },
    };
    const onExample = vi.fn();

    await expect(
      generateExamples(examples, deps({ model: flaky, onExample }), 0),
    ).rejects.toThrow(/Segunda pergunta\?.*failed/);
    expect(onExample).toHaveBeenCalledTimes(1);
  });

  it("refuses an answer that cites a source the prompt did not have", async () => {
    await expect(
      generateExamples(
        examples.slice(0, 1),
        deps({ model: createFakeAnswerModel("Saiu [1] e [9].") }),
        0,
      ),
    ).rejects.toThrow(/missing sources: 9/);
  });
});
