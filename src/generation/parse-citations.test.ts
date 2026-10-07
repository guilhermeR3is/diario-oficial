import { describe, expect, it } from "vitest";
import { NOT_FOUND_ANSWER } from "./build-prompt";
import { isNotFound, parseCitations } from "./parse-citations";

describe("parseCitations", () => {
  it("lists each cited source once, in ascending order", () => {
    const answer =
      "A nomeação saiu [2]. A exoneração também [1]. Repetindo [2].";

    expect(parseCitations(answer, 6)).toEqual({ cited: [1, 2], invalid: [] });
  });

  it("reads several numbers inside one bracket, with or without spaces", () => {
    expect(parseCitations("Fato [1, 3] e outro [4,5].", 6).cited).toEqual([
      1, 3, 4, 5,
    ]);
  });

  it("reads brackets written side by side", () => {
    expect(parseCitations("Fato [1][2] [3]", 6).cited).toEqual([1, 2, 3]);
  });

  it("tolerates spaces just inside the bracket", () => {
    expect(parseCitations("Fato [ 2 ].", 6).cited).toEqual([2]);
  });

  it("separates numbers that point to no source from the valid ones", () => {
    const answer = "Fato [0] e [3] e [7] e [99].";

    expect(parseCitations(answer, 6)).toEqual({
      cited: [3],
      invalid: [0, 7, 99],
    });
  });

  it("treats the last source as valid and the next number as invalid", () => {
    expect(parseCitations("[6] [7]", 6)).toEqual({ cited: [6], invalid: [7] });
  });

  it("ignores brackets that are not citations", () => {
    const answer = "Valor [a] e [1.5] e [] e [1-2] e [2º] e (3).";

    expect(parseCitations(answer, 6)).toEqual({ cited: [], invalid: [] });
  });

  it("returns nothing for an empty answer", () => {
    expect(parseCitations("", 6)).toEqual({ cited: [], invalid: [] });
  });

  it("makes every number invalid when there are no sources", () => {
    expect(parseCitations("Fato [1].", 0)).toEqual({ cited: [], invalid: [1] });
  });
});

describe("isNotFound", () => {
  it("accepts the exact sentence the prompt asks for", () => {
    expect(isNotFound(NOT_FOUND_ANSWER)).toBe(true);
  });

  it("ignores case, surrounding whitespace and the final period", () => {
    expect(isNotFound("  NÃO ENCONTREI nos diários deste período\n")).toBe(
      true,
    );
  });

  it("still counts as a refusal when the model adds an explanation without citing", () => {
    expect(
      isNotFound(`${NOT_FOUND_ANSWER} As fontes falam de outro assunto.`),
    ).toBe(true);
  });

  it("does not count as a refusal when it also cites a source", () => {
    expect(isNotFound(`${NOT_FOUND_ANSWER} Só há [1] sobre outro tema.`)).toBe(
      false,
    );
  });

  it("does not count an answer that only mentions the sentence further on, even without citing", () => {
    expect(
      isNotFound(`Há uma portaria sobre o tema. ${NOT_FOUND_ANSWER}`),
    ).toBe(false);
  });

  it("does not count an ordinary answer or an empty one", () => {
    expect(isNotFound("O decreto foi publicado em 2 de setembro [1].")).toBe(
      false,
    );
    expect(isNotFound("")).toBe(false);
  });
});
