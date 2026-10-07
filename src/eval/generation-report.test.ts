import { describe, expect, it } from "vitest";
import {
  formatGenerationReport,
  summarizeGeneration,
} from "./generation-report";
import type { GenerationResult } from "./generation-result";
import type { EvalQuestion } from "./questions";

const A = "https://exemplo.test/a.pdf";
const B = "https://exemplo.test/b.pdf";
const X = "https://exemplo.test/x.pdf";

const question = (
  id: string,
  kind: EvalQuestion["kind"],
  relevant: { sourceUrl: string; ordinal: number }[] = [],
): EvalQuestion => ({
  id,
  kind,
  question: `Pergunta número ${id}?`,
  relevant,
  evidence: kind === "unanswerable" ? [] : ["frase literal do diário"],
  absent: kind === "unanswerable" ? ["assunto ausente"] : [],
});

const result = (
  id: string,
  overrides: Partial<GenerationResult> = {},
): GenerationResult => ({
  id,
  model: "openai/teste",
  promptVersion: "v1",
  answer: "Resposta [1].",
  notFound: false,
  citations: [1],
  invalidCitations: [],
  sources: [],
  ...overrides,
});

const questions = [
  question("q01", "exact", [{ sourceUrl: A, ordinal: 1 }]),
  question("q02", "semantic", [{ sourceUrl: B, ordinal: 2 }]),
  question("q03", "mixed", [{ sourceUrl: A, ordinal: 3 }]),
  question("q04", "semantic", [{ sourceUrl: B, ordinal: 4 }]),
  question("q05", "exact", [{ sourceUrl: A, ordinal: 5 }]),
  question("q36", "unanswerable"),
  question("q37", "unanswerable"),
  question("q38", "unanswerable"),
];

const results = [
  // acertou: o trecho certo é a fonte 1 e ele a citou
  result("q01", {
    sources: [
      { sourceUrl: A, ordinal: 1 },
      { sourceUrl: X, ordinal: 9 },
    ],
  }),
  // o trecho certo é a fonte 2, mas ele citou a fonte 1
  result("q02", {
    sources: [
      { sourceUrl: X, ordinal: 9 },
      { sourceUrl: B, ordinal: 2 },
    ],
    citations: [1],
  }),
  // recusou com o trecho certo nas fontes: recusa indevida
  result("q03", {
    sources: [{ sourceUrl: A, ordinal: 3 }],
    answer: "Não encontrei nos diários deste período.",
    notFound: true,
    citations: [],
  }),
  // o trecho certo ficou fora das fontes e ele respondeu sem citar nada
  result("q04", { sources: [{ sourceUrl: X, ordinal: 9 }], citations: [] }),
  // mesma edição, outro ordinal: não é o trecho certo
  result("q05", { sources: [{ sourceUrl: A, ordinal: 6 }], citations: [1] }),
  result("q36", {
    notFound: true,
    citations: [],
    answer: "Não encontrei nos diários deste período.",
  }),
  result("q37", {
    citations: [1],
    invalidCitations: [9],
    sources: [{ sourceUrl: X, ordinal: 1 }],
  }),
];

describe("summarizeGeneration", () => {
  const summary = summarizeGeneration(questions, results);

  it("counts how many questions have a result and lists the ones that do not", () => {
    expect(summary.evaluated).toBe(7);
    expect(summary.missing).toEqual(["q38"]);
  });

  it("counts the questions without an answer in the diaries that were refused", () => {
    expect(summary.unanswerable).toEqual({
      total: 2,
      refused: 1,
      answeredIds: ["q37"],
    });
  });

  it("splits the answerable questions by whether the right chunk was among the sources", () => {
    expect(summary.reachable).toMatchObject({
      total: 3,
      answered: 2,
      refused: 1,
    });
    expect(summary.unreachable).toEqual({ total: 2, answered: 2, refused: 0 });
  });

  it("counts a citation as right only when [n] points at the right chunk", () => {
    // q01 cita a fonte 1 (certa); q02 cita a fonte 1 (errada, a certa é a 2)
    expect(summary.reachable.citedRelevant).toBe(1);
  });

  it("treats the same edition with another ordinal as a different chunk", () => {
    expect(summary.unreachable.total).toBe(2);
  });

  it("lists answers that cite nothing valid, and answers with numbers that do not exist", () => {
    expect(summary.uncited).toEqual(["q04"]);
    expect(summary.invalidCitations).toEqual(["q37"]);
  });

  it("does not count a refusal as an answer without citations", () => {
    expect(summary.uncited).not.toContain("q03");
    expect(summary.uncited).not.toContain("q36");
  });

  it("does not break when there are no results at all", () => {
    expect(summarizeGeneration(questions, [])).toMatchObject({
      evaluated: 0,
      unanswerable: { total: 0, refused: 0, answeredIds: [] },
      reachable: { total: 0 },
    });
  });
});

describe("formatGenerationReport", () => {
  const report = formatGenerationReport(questions, results, {
    model: "openai/teste",
    promptVersion: "v1",
  });

  it("says which model and prompt were measured and how many questions have a result", () => {
    expect(report).toContain(
      "Modelo: openai/teste | prompt v1 | 7 de 8 perguntas avaliadas",
    );
    expect(report).toContain("Sem resultado ainda: q38");
  });

  it("gives the refusal count and who failed it", () => {
    expect(report).toContain("Recusaram corretamente: 1 de 2");
    expect(report).toContain("Responderam em vez de recusar: q37");
  });

  it("shows the table of answerable questions", () => {
    expect(report).toContain(
      "| Trecho certo entre as fontes | 3 | 2 | 1 | 1 |",
    );
    expect(report).toContain(
      "| Trecho certo fora das fontes | 2 | 2 | 0 | - |",
    );
  });

  it("has one row per question with the flags to read at a glance", () => {
    expect(report).toContain(
      "| q01 | exact | respondeu | sim | sim | - | Resposta [1]. |",
    );
    expect(report).toContain(
      "| q02 | semantic | respondeu | sim | não | - | Resposta [1]. |",
    );
    expect(report).toContain("| q03 | mixed | recusou | sim | - | - |");
    expect(report).toContain("| q36 | unanswerable | recusou | - | - | - |");
    expect(report).toContain("| q37 | unanswerable | respondeu | - | - | 9 |");
  });

  it("leaves out the missing-results line when every question has a result", () => {
    const complete = formatGenerationReport(
      questions.slice(0, 1),
      results.slice(0, 1),
      { model: "m", promptVersion: "v1" },
    );

    expect(complete).not.toContain("Sem resultado ainda");
  });

  it("keeps a long answer to one short line and protects the table from pipes", () => {
    const long = `Primeira linha\ncom | barra ${"x".repeat(200)}`;
    const text = formatGenerationReport(
      [question("q01", "exact", [{ sourceUrl: A, ordinal: 1 }])],
      [
        result("q01", {
          answer: long,
          sources: [{ sourceUrl: A, ordinal: 1 }],
        }),
      ],
      { model: "m", promptVersion: "v1" },
    );

    const row = text.split("\n").find((l) => l.startsWith("| q01"))!;
    expect(row).toContain("Primeira linha com \\| barra");
    expect(row.endsWith("... |")).toBe(true);
    expect(row).not.toContain("x".repeat(101));
  });
});

describe("order of the questions", () => {
  const meta = { model: "m", promptVersion: "v1" };
  const reversed = [...questions].reverse();

  it("lists the rows by question id, whatever order the questions came in", () => {
    const text = formatGenerationReport(reversed, results, meta);

    const ids = text
      .split("\n")
      .filter((l) => /^\| q\d\d /.test(l))
      .map((l) => l.split(" ")[1]);
    expect(ids).toEqual(["q01", "q02", "q03", "q04", "q05", "q36", "q37"]);
  });

  it("lists the questions without a result by question id too", () => {
    expect(summarizeGeneration(reversed, results.slice(0, 2)).missing).toEqual([
      "q03",
      "q04",
      "q05",
      "q36",
      "q37",
      "q38",
    ]);
  });
});
