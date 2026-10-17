import { describe, expect, it } from "vitest";
import { parseQuestionSet } from "./question-sets";

describe("parseQuestionSet", () => {
  it("uses the 40 questions of the plan unless told otherwise", () => {
    expect(parseQuestionSet([])).toBe("main");
    expect(parseQuestionSet(["--subset=odd"])).toBe("main");
  });

  it("picks the set named in --set", () => {
    expect(parseQuestionSet(["--set=jan-jun"])).toBe("jan-jun");
  });

  it.each(["--set=todas", "--set=", "--set=toString"])(
    "refuses an unknown set (%s)",
    (arg) => {
      expect(() => parseQuestionSet([arg])).toThrow(/--set deve ser um de/);
    },
  );
});
