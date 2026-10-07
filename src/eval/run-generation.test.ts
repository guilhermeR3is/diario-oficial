import { describe, expect, it, vi } from "vitest";
import type { AnswerModel } from "@/generation/answer-model";
import { NOT_FOUND_ANSWER, PROMPT_VERSION } from "@/generation/build-prompt";
import { createFakeAnswerModel } from "@/generation/fake-answer-model";
import type { SearchHit } from "../search/search-hit";
import type { GenerationResult } from "./generation-result";
import type { EvalQuestion } from "./questions";
import {
  DEFAULT_LIMIT,
  DEFAULT_PAUSE_SECONDS,
  type RunDeps,
  generateForQuestion,
  parseGenerationArgs,
  pendingQuestions,
  runPending,
} from "./run-generation";

const question = (
  id: string,
  kind: EvalQuestion["kind"] = "exact",
): EvalQuestion => ({
  id,
  kind,
  question: `Pergunta número ${id}?`,
  relevant:
    kind === "unanswerable"
      ? []
      : [{ sourceUrl: "https://exemplo.test/a.pdf", ordinal: 1 }],
  evidence: kind === "unanswerable" ? [] : ["frase literal do diário"],
  absent: kind === "unanswerable" ? ["assunto ausente"] : [],
});

const hit = (
  ordinal: number,
  sourceUrl = "https://exemplo.test/a.pdf",
): SearchHit => ({
  chunkId: ordinal,
  ordinal,
  score: 0.5,
  actType: "PORTARIA",
  title: `PORTARIA Nº ${ordinal}/2026`,
  secretariat: null,
  date: "2026-09-02",
  page: 1,
  pageEnd: 1,
  text: `texto ${ordinal}`,
  edition: { id: 1, title: "Edição", sourceUrl },
});

const savedResult = (
  id: string,
  overrides: Partial<GenerationResult> = {},
): GenerationResult => ({
  id,
  model: "fake",
  promptVersion: PROMPT_VERSION,
  answer: "ok [1]",
  notFound: false,
  citations: [1],
  invalidCitations: [],
  sources: [],
  ...overrides,
});

describe("parseGenerationArgs", () => {
  it("starts with a small batch and a one-minute pause", () => {
    expect(parseGenerationArgs([])).toEqual({
      limit: DEFAULT_LIMIT,
      pauseSeconds: DEFAULT_PAUSE_SECONDS,
      reportOnly: false,
      yes: false,
    });
    expect(DEFAULT_LIMIT).toBe(20);
    expect(DEFAULT_PAUSE_SECONDS).toBe(60);
  });

  it("reads every option", () => {
    expect(
      parseGenerationArgs([
        "--limit=5",
        "--pause-seconds=10",
        "--report",
        "--yes",
      ]),
    ).toEqual({ limit: 5, pauseSeconds: 10, reportOnly: true, yes: true });
  });

  it.each(["0", "-3", "1.5", "abc", ""])(
    "refuses --limit=%s, which would spend the quota in a way nobody planned",
    (value) => {
      expect(() => parseGenerationArgs([`--limit=${value}`])).toThrow(
        /--limit deve ser um inteiro maior que zero/,
      );
    },
  );

  it("refuses a bad pause", () => {
    expect(() => parseGenerationArgs(["--pause-seconds=0"])).toThrow(
      /--pause-seconds deve ser um inteiro maior que zero/,
    );
  });

  it("refuses an option it does not know, so a typo does not run with the defaults", () => {
    expect(() => parseGenerationArgs(["--limt=5"])).toThrow(
      'argumento desconhecido "--limt=5"',
    );
  });
});

describe("pendingQuestions", () => {
  const current = { model: "fake", promptVersion: PROMPT_VERSION };
  const all = [
    question("q03"),
    question("q37", "unanswerable"),
    question("q01"),
    question("q36", "unanswerable"),
    question("q02", "semantic"),
  ];

  it("puts the questions without an answer first, then goes by id", () => {
    expect(pendingQuestions(all, [], current).map((q) => q.id)).toEqual([
      "q36",
      "q37",
      "q01",
      "q02",
      "q03",
    ]);
  });

  it("skips what this model already answered with this prompt", () => {
    const results = [savedResult("q36"), savedResult("q01")];

    expect(pendingQuestions(all, results, current).map((q) => q.id)).toEqual([
      "q37",
      "q02",
      "q03",
    ]);
  });

  it("asks again when the result is from another model or another prompt version", () => {
    const results = [
      savedResult("q36", { model: "outro/modelo" }),
      savedResult("q37", { promptVersion: "v0" }),
    ];

    expect(pendingQuestions(all, results, current).map((q) => q.id)).toEqual([
      "q36",
      "q37",
      "q01",
      "q02",
      "q03",
    ]);
  });

  it("cuts the batch at the limit after ordering", () => {
    expect(pendingQuestions(all, [], current, 3).map((q) => q.id)).toEqual([
      "q36",
      "q37",
      "q01",
    ]);
  });

  it("does not reorder the list it received", () => {
    const before = all.map((q) => q.id);

    pendingQuestions(all, [], current);

    expect(all.map((q) => q.id)).toEqual(before);
  });
});

describe("generateForQuestion", () => {
  it("keeps the answer, the citations and the sources in prompt order", async () => {
    const model = createFakeAnswerModel("A portaria saiu [2] e [9].");
    const hits = [
      hit(7, "https://exemplo.test/a.pdf"),
      hit(8, "https://exemplo.test/b.pdf"),
    ];

    const result = await generateForQuestion(question("q05"), hits, model);

    expect(result).toEqual({
      id: "q05",
      model: "fake",
      promptVersion: PROMPT_VERSION,
      answer: "A portaria saiu [2] e [9].",
      notFound: false,
      citations: [2],
      invalidCitations: [9],
      sources: [
        { sourceUrl: "https://exemplo.test/a.pdf", ordinal: 7 },
        { sourceUrl: "https://exemplo.test/b.pdf", ordinal: 8 },
      ],
    });
  });

  it("asks the model the text of the question", async () => {
    const model = createFakeAnswerModel("ok [1]");

    await generateForQuestion(question("q05"), [hit(1)], model);

    expect(model.prompts[0].user).toContain("Pergunta número q05?");
  });

  it("records a refusal", async () => {
    const model = createFakeAnswerModel(NOT_FOUND_ANSWER);

    const result = await generateForQuestion(
      question("q36", "unanswerable"),
      [hit(1)],
      model,
    );

    expect(result).toMatchObject({ notFound: true, citations: [] });
  });

  it("answers not found without the model when there are no sources", async () => {
    const model = createFakeAnswerModel("não deveria ser dito [1]");

    const result = await generateForQuestion(
      question("q36", "unanswerable"),
      [],
      model,
    );

    expect(model.prompts).toEqual([]);
    expect(result).toMatchObject({ notFound: true, sources: [] });
  });

  it("returns null when the model fails", async () => {
    const failing: AnswerModel = {
      name: "failing",
      async *stream() {
        yield* [] as string[];
        throw new Error("429");
      },
    };

    expect(
      await generateForQuestion(question("q05"), [hit(1)], failing),
    ).toBeNull();
  });
});

describe("runPending", () => {
  const PAUSE = 60_000;

  function setup(outcomes: ("ok" | "fail")[], secondsPerQuestion = 7) {
    const clock = { time: 0 };
    const saved: GenerationResult[] = [];
    const sleeps: number[] = [];
    const progress: string[] = [];
    const searched: { question: string; vector: number[] }[] = [];
    let call = 0;

    const model: AnswerModel = {
      name: "fake",
      async *stream() {
        const outcome = outcomes[call++];
        clock.time += secondsPerQuestion * 1000;
        if (outcome === "fail") throw new Error("429");
        yield "Resposta [1].";
      },
    };
    const deps: RunDeps = {
      model,
      vectorOf: async (text) => [text.length],
      search: async (query) => {
        searched.push(query);
        return [hit(1)];
      },
      save: async (result) => void saved.push(result),
      sleep: async (ms) => {
        sleeps.push(ms);
        clock.time += ms;
      },
      now: () => clock.time,
      onQuestion: ({ question, position, total, result }) =>
        progress.push(
          `${position}/${total} ${question.id} ${result ? "ok" : "falhou"}`,
        ),
    };
    return { deps, saved, sleeps, progress, searched };
  }

  const three = [question("q01"), question("q02"), question("q03")];

  it("answers each question in order, saves it and reports the progress", async () => {
    const { deps, saved, progress } = setup(["ok", "ok", "ok"]);

    const outcome = await runPending(three, deps, PAUSE);

    expect(outcome).toEqual({ saved: 3, failed: 0, stoppedEarly: false });
    expect(saved.map((r) => r.id)).toEqual(["q01", "q02", "q03"]);
    expect(progress).toEqual(["1/3 q01 ok", "2/3 q02 ok", "3/3 q03 ok"]);
  });

  it("searches with the text of each question and the vector made for it", async () => {
    const { deps, searched } = setup(["ok"]);

    await runPending([question("q01")], deps, PAUSE);

    expect(searched).toEqual([
      {
        question: "Pergunta número q01?",
        vector: ["Pergunta número q01?".length],
      },
    ]);
  });

  it("waits what is left of the pause between questions, counted from the start of each", async () => {
    const { deps, sleeps } = setup(["ok", "ok", "ok"], 7);

    await runPending(three, deps, PAUSE);

    expect(sleeps).toEqual([53_000, 53_000]);
  });

  it("does not wait after the last question", async () => {
    const { deps, sleeps } = setup(["ok"]);

    await runPending([question("q01")], deps, PAUSE);

    expect(sleeps).toEqual([]);
  });

  it("does not wait at all when the question already took longer than the pause", async () => {
    const { deps, sleeps } = setup(["ok", "ok"], 90);

    await runPending([question("q01"), question("q02")], deps, PAUSE);

    expect(sleeps).toEqual([0]);
  });

  it("stops after two failures in a row and does not touch the rest of the quota", async () => {
    const { deps, saved, progress } = setup(["ok", "fail", "fail", "ok"]);
    const four = [...three, question("q04")];

    const outcome = await runPending(four, deps, PAUSE);

    expect(outcome).toEqual({ saved: 1, failed: 2, stoppedEarly: true });
    expect(saved.map((r) => r.id)).toEqual(["q01"]);
    expect(progress).toHaveLength(3);
  });

  it("keeps going after a single failure and does not save it", async () => {
    const { deps, saved } = setup(["fail", "ok", "fail"]);

    const outcome = await runPending(three, deps, PAUSE);

    expect(outcome).toEqual({ saved: 1, failed: 2, stoppedEarly: false });
    expect(saved.map((r) => r.id)).toEqual(["q02"]);
  });

  it("returns at once when there is nothing to do", async () => {
    const { deps } = setup([]);
    const save = vi.spyOn(deps, "save");

    expect(await runPending([], deps, PAUSE)).toEqual({
      saved: 0,
      failed: 0,
      stoppedEarly: false,
    });
    expect(save).not.toHaveBeenCalled();
  });
});
