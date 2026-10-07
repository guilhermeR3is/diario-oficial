import { describe, expect, it } from "vitest";
import { formatReport } from "./report";
import type { EvalQuestion } from "./questions";
import type { RetrievalRun } from "./run-retrieval";

const question = (id: string, kind: EvalQuestion["kind"]): EvalQuestion => ({
  id,
  kind,
  question: `Pergunta ${id} com texto suficiente?`,
  relevant: [{ sourceUrl: "https://exemplo.test/1.pdf", ordinal: 1 }],
  evidence: ["frase de evidência"],
  absent: [],
});

const run: RetrievalRun = {
  questions: [
    question("q01", "exact"),
    question("q02", "exact"),
    question("q03", "semantic"),
    question("q04", "semantic"),
  ],
  ranks: {
    vector: [1, null, 2, 6],
    text: [1, 1, null, null],
    hybrid: [1, 1, 1, 6],
  },
};

const report = formatReport(run);
const lineStarting = (start: string) =>
  report.split("\n").find((line) => line.startsWith(start))!;

describe("formatReport", () => {
  it("titles the overall table with the number of questions", () => {
    expect(report).toContain("## Resultado geral (4 perguntas com resposta)");
  });

  it("gives recall@5 and MRR of each search, with a decimal comma and an interval", () => {
    expect(lineStarting("| só vetorial")).toMatch(
      /^\| só vetorial \| 0,50 \[\d,\d\d; \d,\d\d\] \| 0,42 \[\d,\d\d; \d,\d\d\] \|$/,
    );
    expect(lineStarting("| só textual")).toMatch(/^\| só textual \| 0,50 \[/);
    expect(lineStarting("| híbrida")).toMatch(/^\| híbrida \| 0,75 \[/);
  });

  it("shows the paired differences with a sign", () => {
    expect(lineStarting("| híbrida − só vetorial")).toMatch(
      /^\| híbrida − só vetorial \| \+0,25 \[/,
    );
    expect(lineStarting("| só textual − só vetorial")).toMatch(
      /^\| só textual − só vetorial \| \+0,00 \[|^\| só textual − só vetorial \| −0,00 \[/,
    );
  });

  it("shows a minus sign when the first search does worse than the second", () => {
    const worse = formatReport({
      questions: run.questions,
      ranks: {
        vector: [1, 1, 1, 1],
        text: [null, null, null, null],
        hybrid: [null, null, null, null],
      },
    });
    const line = worse
      .split("\n")
      .find((l) => l.startsWith("| híbrida − só vetorial"))!;

    expect(line).toMatch(
      /^\| híbrida − só vetorial \| −1,00 \[−1,00; −1,00\] \| −1,00 \[−1,00; −1,00\] \|$/,
    );
  });

  it("splits the results by kind of question", () => {
    expect(lineStarting("| exact")).toBe(
      "| exact | 2 | 0,50 / 0,50 | 1,00 / 1,00 | 1,00 / 1,00 |",
    );
    expect(lineStarting("| semantic")).toBe(
      "| semantic | 2 | 0,50 / 0,33 | 0,00 / 0,00 | 0,50 / 0,58 |",
    );
  });

  it("lists the position found for each question, with a dash when it did not appear", () => {
    expect(lineStarting("| q02")).toBe("| q02 | exact | – | 1 | 1 |");
    expect(lineStarting("| q04")).toBe("| q04 | semantic | 6 | – | 6 |");
  });
});
