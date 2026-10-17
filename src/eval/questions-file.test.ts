import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EXPECTED_COUNTS } from "./check-questions";
import { QUESTION_SETS } from "./question-sets";
import { parseQuestions, QUESTION_KINDS } from "./questions";

const questions = parseQuestions(readFileSync("eval/questions.jsonl", "utf8"));

describe("eval/questions.jsonl", () => {
  it("has the 40 questions of the plan, 5 of them without an answer", () => {
    expect(questions).toHaveLength(EXPECTED_COUNTS.total);
    expect(questions.filter((q) => q.kind === "unanswerable")).toHaveLength(
      EXPECTED_COUNTS.unanswerable,
    );
  });

  it("numbers the questions q01 to q40 in order, with no repeated question", () => {
    expect(questions.map((q) => q.id)).toEqual(
      Array.from(
        { length: 40 },
        (_, i) => `q${String(i + 1).padStart(2, "0")}`,
      ),
    );
    expect(new Set(questions.map((q) => q.question)).size).toBe(40);
  });

  it("uses every kind of question at least five times", () => {
    for (const kind of QUESTION_KINDS) {
      expect(
        questions.filter((q) => q.kind === kind).length,
      ).toBeGreaterThanOrEqual(5);
    }
  });

  it("lists every relevant chunk once per question", () => {
    for (const { id, relevant } of questions) {
      const keys = relevant.map((key) => `${key.sourceUrl}#${key.ordinal}`);
      expect(new Set(keys).size, id).toBe(keys.length);
    }
  });
});

describe("eval/questions-jan-jun.jsonl", () => {
  const raw = readFileSync(QUESTION_SETS["jan-jun"].file, "utf8");
  const janJun = parseQuestions(raw);

  it("has 16 questions, 2 of them without an answer", () => {
    const { expected } = QUESTION_SETS["jan-jun"];
    expect(janJun).toHaveLength(expected.total);
    expect(janJun.filter((q) => q.kind === "unanswerable")).toHaveLength(
      expected.unanswerable,
    );
  });

  it("continues the numbering at q41 and repeats no question of the main set", () => {
    expect(janJun.map((q) => q.id)).toEqual(
      Array.from({ length: 16 }, (_, i) => `q${i + 41}`),
    );
    const main = new Set(questions.map((q) => q.question));
    expect(janJun.filter((q) => main.has(q.question))).toEqual([]);
  });

  it("uses every kind of question", () => {
    for (const kind of QUESTION_KINDS) {
      expect(
        janJun.some((q) => q.kind === kind),
        kind,
      ).toBe(true);
    }
  });

  // congelado antes de qualquer experimento na busca: mudar o arquivo invalida a medida como teste limpo
  it("is still the frozen version", () => {
    expect(createHash("sha256").update(raw).digest("hex")).toBe(
      "0a819a889ef30c44193a55f8f5384cb1903882f8310345ebf7f681fb7058c5b8",
    );
  });
});
