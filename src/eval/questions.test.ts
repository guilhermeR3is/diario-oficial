import { describe, expect, it } from "vitest";
import { parseQuestions } from "./questions";

const key = { sourceUrl: "https://exemplo.test/230.pdf", ordinal: 3 };

const answerable = {
  id: "q01",
  kind: "exact",
  question: "Qual é a portaria que trata da cessão de servidor?",
  relevant: [key],
  evidence: ["cessão de servidor"],
  absent: [],
};

const unanswerable = {
  id: "q02",
  kind: "unanswerable",
  question: "Qual foi o valor do IPTU cobrado em 2027?",
  relevant: [],
  evidence: [],
  absent: ["IPTU 2027"],
};

const line = (value: unknown) => JSON.stringify(value);

describe("parseQuestions", () => {
  it("reads one question per line and skips blank lines", () => {
    const raw = `${line(answerable)}\n\n${line(unanswerable)}\n`;

    expect(parseQuestions(raw).map((q) => q.id)).toEqual(["q01", "q02"]);
  });

  it("points at the line of invalid JSON", () => {
    expect(() => parseQuestions(`${line(answerable)}\n{quebrado`)).toThrow(
      /linha 2: JSON inválido/,
    );
  });

  it.each([
    ["an id outside the qNN format", { ...answerable, id: "pergunta1" }, /id/],
    ["an unknown field", { ...answerable, extra: 1 }, /extra|Unrecognized/i],
    [
      "an unknown field inside a chunk key",
      { ...answerable, relevant: [{ ...key, page: 4 }] },
      /relevant/,
    ],
    ["an unknown kind", { ...answerable, kind: "outra" }, /kind/],
    [
      "an answerable question without a relevant chunk",
      { ...answerable, relevant: [] },
      /relevant: não pode ficar vazio/,
    ],
    [
      "an answerable question without evidence",
      { ...answerable, evidence: [] },
      /evidence: não pode ficar vazio/,
    ],
    [
      "an answerable question with absent terms",
      { ...answerable, absent: ["x y z"] },
      /absent: deve ficar vazio/,
    ],
    [
      "an unanswerable question without absent terms",
      { ...unanswerable, absent: [] },
      /absent: não pode ficar vazio/,
    ],
    [
      "an unanswerable question with a relevant chunk",
      { ...unanswerable, relevant: [key] },
      /relevant: deve ficar vazio/,
    ],
    [
      "a negative ordinal",
      { ...answerable, relevant: [{ ...key, ordinal: -1 }] },
      /ordinal/,
    ],
    [
      "a source URL that is not a URL",
      { ...answerable, relevant: [{ ...key, sourceUrl: "230.pdf" }] },
      /sourceUrl/,
    ],
  ])("rejects %s, naming the line", (_name, value, message) => {
    expect(() => parseQuestions(`${line(answerable)}\n${line(value)}`)).toThrow(
      message,
    );
    expect(() => parseQuestions(`${line(answerable)}\n${line(value)}`)).toThrow(
      /linha 2/,
    );
  });
});
