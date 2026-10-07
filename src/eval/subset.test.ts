import { describe, expect, it } from "vitest";
import type { EvalQuestion } from "./questions";
import { parseSubset, selectSubset } from "./subset";

const question = (id: string): EvalQuestion => ({
  id,
  kind: "exact",
  question: `Pergunta ${id} com texto suficiente?`,
  relevant: [{ sourceUrl: "https://exemplo.test/1.pdf", ordinal: 1 }],
  evidence: ["frase de evidência"],
  absent: [],
});

const questions = ["q01", "q02", "q03", "q04", "q10"].map(question);
const ids = (list: EvalQuestion[]) => list.map((q) => q.id);

describe("selectSubset", () => {
  it("keeps every question for all", () => {
    expect(ids(selectSubset(questions, "all"))).toEqual([
      "q01",
      "q02",
      "q03",
      "q04",
      "q10",
    ]);
  });

  it("keeps the odd numbers for tuning", () => {
    expect(ids(selectSubset(questions, "odd"))).toEqual(["q01", "q03"]);
  });

  it("keeps the even numbers for the final result, q10 included", () => {
    expect(ids(selectSubset(questions, "even"))).toEqual(["q02", "q04", "q10"]);
  });
});

describe("parseSubset", () => {
  it("defaults to all", () => {
    expect(parseSubset([])).toBe("all");
  });

  it("reads --subset=odd and --subset=even", () => {
    expect(parseSubset(["--subset=odd"])).toBe("odd");
    expect(parseSubset(["x", "--subset=even"])).toBe("even");
  });

  it("refuses an unknown subset, naming the options", () => {
    expect(() => parseSubset(["--subset=metade"])).toThrow(
      /all, odd, even.*metade/,
    );
  });
});
