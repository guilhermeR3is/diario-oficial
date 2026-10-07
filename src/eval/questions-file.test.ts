import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EXPECTED_COUNTS } from "./check-questions";
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
