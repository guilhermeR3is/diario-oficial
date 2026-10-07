import { describe, expect, it } from "vitest";
import { checkQuestions, type IndexedChunk } from "./check-questions";
import type { EvalQuestion } from "./questions";

const url = (n: number) => `https://exemplo.test/${n}.pdf`;

const chunk = (n: number, ordinal: number, text: string): IndexedChunk => ({
  sourceUrl: url(n),
  ordinal,
  page: 1,
  title: "PORTARIA",
  editionTitle: `Edição ${n}`,
  text,
});

const chunks = [
  chunk(
    1,
    0,
    "Fica designada a servidora para fiscalizar o\ncontrato de merenda.",
  ),
  chunk(1, 1, "continuação: fiscalizar o contrato de merenda escolar na rede."),
  chunk(2, 0, "Nomeação de professor para a rede municipal."),
];

const question = (overrides: Partial<EvalQuestion>): EvalQuestion => ({
  id: "q01",
  kind: "semantic",
  question: "Quem fiscaliza o contrato de merenda?",
  relevant: [
    { sourceUrl: url(1), ordinal: 0 },
    { sourceUrl: url(1), ordinal: 1 },
  ],
  evidence: ["fiscalizar o contrato de merenda"],
  absent: [],
  ...overrides,
});

const unanswerable = (overrides: Partial<EvalQuestion> = {}): EvalQuestion =>
  question({
    id: "q02",
    kind: "unanswerable",
    question: "Qual o valor do IPTU de 2027?",
    relevant: [],
    evidence: [],
    absent: ["IPTU de 2027"],
    ...overrides,
  });

const expected = { total: 2, unanswerable: 1 };
const check = (questions: EvalQuestion[]) =>
  checkQuestions(questions, chunks, expected);

describe("checkQuestions", () => {
  it("accepts a gabarito that lists exactly the chunks holding the evidence", () => {
    expect(check([question({}), unanswerable()])).toEqual([]);
  });

  it("matches the evidence across line breaks and repeated spaces", () => {
    const q = question({ evidence: ["fiscalizar   o contrato\nde merenda"] });

    expect(check([q, unanswerable()])).toEqual([]);
  });

  it("reports a chunk that holds the evidence but is missing from the gabarito", () => {
    const q = question({ relevant: [{ sourceUrl: url(1), ordinal: 0 }] });

    expect(check([q, unanswerable()])).toEqual([
      `q01: o trecho ${url(1)}#1 contém a evidência e falta no gabarito`,
    ]);
  });

  it("reports a listed chunk that holds no evidence", () => {
    const q = question({
      relevant: [...question({}).relevant, { sourceUrl: url(2), ordinal: 0 }],
    });

    expect(check([q, unanswerable()])).toEqual([
      `q01: o trecho ${url(2)}#0 está no gabarito, mas não contém nenhuma evidência`,
    ]);
  });

  it("reports a listed chunk that does not exist", () => {
    const q = question({
      relevant: [...question({}).relevant, { sourceUrl: url(9), ordinal: 4 }],
    });

    expect(check([q, unanswerable()])).toEqual([
      `q01: o trecho ${url(9)}#4 não existe no banco`,
    ]);
  });

  it("reports evidence that is in no chunk", () => {
    const q = question({
      evidence: [
        "fiscalizar o contrato de merenda",
        "frase que ninguém escreveu",
      ],
    });

    expect(check([q, unanswerable()])).toEqual([
      'q01: a evidência "frase que ninguém escreveu" não está em nenhum trecho',
    ]);
  });

  it("reports an absent term that appears in the corpus", () => {
    const q = unanswerable({ absent: ["IPTU de 2027", "professor"] });

    expect(check([question({}), q])).toEqual([
      'q02: o termo "professor" deveria estar ausente, mas aparece em 1 trecho(s)',
    ]);
  });

  it("reports repeated ids and repeated questions", () => {
    const problems = check([question({}), question({})]);

    expect(problems).toContain("q01: id repetido");
    expect(problems).toContain("q01: pergunta repetida");
  });

  it("reports the wrong number of questions and of unanswerable ones", () => {
    expect(checkQuestions([question({})], chunks, expected)).toEqual([
      "esperadas 2 perguntas, há 1",
      "esperadas 1 perguntas sem resposta, há 0",
    ]);
  });

  it("expects the 40 questions of the plan, 5 of them unanswerable, by default", () => {
    expect(checkQuestions([], chunks)).toEqual([
      "esperadas 40 perguntas, há 0",
      "esperadas 5 perguntas sem resposta, há 0",
    ]);
  });
});
