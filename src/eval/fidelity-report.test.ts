import { describe, expect, it } from "vitest";
import {
  type SampleCase,
  formatFidelityReport,
  formatSample,
  pickSample,
  summarizeFidelity,
} from "./fidelity-report";
import type { ClaimVerdict, FidelityResult } from "./fidelity-result";

const ok = (text = "Fato certo"): ClaimVerdict => ({
  text,
  citations: [1],
  supported: true,
  reason: "consta no trecho",
});
const bad = (
  text = "Fato errado",
  reason = "o trecho diz outra coisa",
): ClaimVerdict => ({
  text,
  citations: [2],
  supported: false,
  reason,
});
const noSource = (): ClaimVerdict => ({
  text: "Fato solto",
  citations: [],
  supported: false,
  reason: "sem citação válida",
});

const check = (id: string, claims: ClaimVerdict[]): FidelityResult => ({
  id,
  verifier: "qwen/teste",
  promptVersion: "v1",
  answer: `Resposta de ${id} [1].`,
  claims,
});

const meta = { verifier: "qwen/teste", promptVersion: "v1" };

const checks = [
  check("q02", [ok(), bad("A multa é de R$ 10")]),
  check("q01", [ok(), ok()]),
  check("q03", [noSource()]),
];

describe("summarizeFidelity", () => {
  const summary = summarizeFidelity(checks);

  it("counts answers, claims, supported and unsupported", () => {
    expect(summary).toMatchObject({
      answers: 3,
      claims: 5,
      supported: 3,
      unsupported: 2,
    });
  });

  it("counts apart the claims that were reproved only for having no valid citation", () => {
    expect(summary.noValidCitation).toBe(1);
  });

  it("lists, by question id, only the unsupported claims of each flagged answer", () => {
    expect(summary.flagged).toEqual([
      { id: "q02", claims: [bad("A multa é de R$ 10")] },
      { id: "q03", claims: [noSource()] },
    ]);
  });

  it("does not break with nothing checked", () => {
    expect(summarizeFidelity([])).toEqual({
      answers: 0,
      claims: 0,
      supported: 0,
      unsupported: 0,
      noValidCitation: 0,
      flagged: [],
    });
  });
});

describe("formatFidelityReport", () => {
  const report = formatFidelityReport(checks, ["q04"], meta);

  it("says who checked, with which prompt, how many answers, and what is still missing", () => {
    expect(report).toContain(
      "Verificador: qwen/teste | prompt v1 | 3 respostas conferidas",
    );
    expect(report).toContain("Sem conferência ainda: q04");
  });

  it("gives the share of supported claims", () => {
    expect(report).toContain("Sustentadas pelo trecho citado: 3 de 5 (60%)");
    expect(report).toContain(
      "Não sustentadas: 2, das quais 1 sem citação válida",
    );
  });

  it("lists each unsupported claim with the sources it cites and the reason", () => {
    expect(report).toContain(
      '- q02: "A multa é de R$ 10" (cita [2]): o trecho diz outra coisa',
    );
    expect(report).toContain(
      '- q03: "Fato solto" (cita nada): sem citação válida',
    );
  });

  it("has one row per answer, by id", () => {
    const rows = report.split("\n").filter((line) => /^\| q\d\d /.test(line));

    expect(rows).toEqual([
      "| q01 | 2 | 2 | 0 |",
      "| q02 | 2 | 1 | 1 |",
      "| q03 | 1 | 0 | 1 |",
    ]);
  });

  it("warns that the verifier also makes mistakes", () => {
    expect(report).toContain("O verificador também erra");
  });

  it("says so when no claim was reproved, and leaves out the missing line when nothing is missing", () => {
    const clean = formatFidelityReport([check("q01", [ok()])], [], meta);

    expect(clean).toContain("## Afirmações não sustentadas\n\nnenhuma");
    expect(clean).not.toContain("Sem conferência ainda");
  });

  it("says there is no claim instead of dividing by zero", () => {
    expect(formatFidelityReport([], [], meta)).toContain(
      "Sustentadas pelo trecho citado: nenhuma afirmação",
    );
  });
});

describe("pickSample", () => {
  const flagged = (n: number) =>
    Array.from({ length: n }, (_, i) => check(`q${10 + i}`, [bad()]));
  const clean = (n: number) =>
    Array.from({ length: n }, (_, i) => check(`q${50 + i}`, [ok()]));
  const ids = (list: FidelityResult[]) => list.map((c) => c.id);
  const isFlagged = (c: FidelityResult) =>
    c.claims.some((claim) => !claim.supported);

  it("takes half from the reproved answers and half from the approved ones", () => {
    const sample = pickSample([...flagged(8), ...clean(20)], 10);

    expect(sample).toHaveLength(10);
    expect(sample.filter(isFlagged)).toHaveLength(5);
  });

  it("fills the rest with approved answers when few were reproved", () => {
    const sample = pickSample([...flagged(2), ...clean(20)], 10);

    expect(sample.filter(isFlagged)).toHaveLength(2);
    expect(sample).toHaveLength(10);
  });

  it("fills the rest with reproved answers when few were approved", () => {
    const sample = pickSample([...flagged(20), ...clean(1)], 10);

    expect(sample.filter(isFlagged)).toHaveLength(9);
    expect(sample).toHaveLength(10);
  });

  it("takes ten answers when no size is given, which is what the command uses", () => {
    expect(pickSample([...flagged(8), ...clean(20)])).toHaveLength(10);
  });

  it("takes everything when there are fewer answers than the size", () => {
    expect(pickSample([...flagged(2), ...clean(3)], 10)).toHaveLength(5);
  });

  it("spreads the choice over the whole list instead of taking the first ones", () => {
    const sample = pickSample(clean(20), 4);

    expect(ids(sample)).toEqual(["q50", "q55", "q60", "q65"]);
  });

  it("gives the same sample every time and in id order, whatever order the answers came in", () => {
    const all = [...flagged(8), ...clean(20)];

    expect(ids(pickSample([...all].reverse(), 10))).toEqual(
      ids(pickSample(all, 10)),
    );
    expect(ids(pickSample(all, 10))).toEqual(
      [...ids(pickSample(all, 10))].sort(),
    );
  });

  it("puts the answers in id order even when the reproved ones have the later ids", () => {
    const early = Array.from({ length: 5 }, (_, i) =>
      check(`q0${i + 1}`, [ok()]),
    );
    const late = Array.from({ length: 5 }, (_, i) => check(`q3${i}`, [bad()]));

    expect(ids(pickSample([...late, ...early], 10))).toEqual([
      "q01",
      "q02",
      "q03",
      "q04",
      "q05",
      "q30",
      "q31",
      "q32",
      "q33",
      "q34",
    ]);
  });

  it("does not repeat an answer", () => {
    const sample = ids(pickSample([...flagged(20), ...clean(1)], 10));

    expect(new Set(sample).size).toBe(sample.length);
  });
});

describe("formatSample", () => {
  const cases: SampleCase[] = [
    {
      check: check("q05", [
        ok("O CNPJ é 45.734.817/0001-21"),
        bad("Foi sucedida pela UNNI S.A."),
      ]),
      question: "Qual empresa tem o CNPJ 45.734.817/0001-21?",
      sources: [
        {
          n: 1,
          key: "https://exemplo.test/a.pdf#10",
          text: "linha um\nlinha dois",
        },
        {
          n: 2,
          key: "https://exemplo.test/a.pdf#20",
          text: "texto do segundo trecho",
        },
      ],
    },
  ];
  const text = formatSample(cases, meta);
  const [beforeVerdicts, verdicts] = text.split("## Veredictos do verificador");

  it("shows the question, the answer, each claim and the full text of each cited chunk", () => {
    expect(beforeVerdicts).toContain(
      "## q05: Qual empresa tem o CNPJ 45.734.817/0001-21?",
    );
    expect(beforeVerdicts).toContain(
      "**Resposta do modelo:** Resposta de q05 [1].",
    );
    expect(beforeVerdicts).toContain(
      '### q05, afirmação 1: "O CNPJ é 45.734.817/0001-21"',
    );
    expect(beforeVerdicts).toContain(
      "**Trecho [2]** (https://exemplo.test/a.pdf#20)",
    );
    expect(beforeVerdicts).toContain("> linha um\n> linha dois");
  });

  it("says when a claim cites nothing", () => {
    const without = formatSample(
      [
        {
          check: check("q09", [noSource()]),
          question: "Pergunta?",
          sources: [],
        },
      ],
      meta,
    );

    expect(without).toContain("Cita: nada");
  });

  it("asks for the reader's own check for every claim", () => {
    expect(beforeVerdicts.split("Sua conferência:")).toHaveLength(3);
  });

  it("keeps the verifier's verdicts out of the part the reader marks, so the reading is blind", () => {
    expect(beforeVerdicts).not.toContain("SUSTENTADA");
    expect(beforeVerdicts).not.toContain("o trecho diz outra coisa");
    expect(beforeVerdicts).not.toContain("consta no trecho");
  });

  it("puts the verdicts at the end, numbered like the claims", () => {
    expect(verdicts).toContain("1. SUSTENTADA: consta no trecho");
    expect(verdicts).toContain("2. NÃO SUSTENTADA: o trecho diz outra coisa");
  });

  it("tells the reader to mark before looking at the verdicts and that nothing is decided for them", () => {
    expect(text).toContain("Marque antes de olhar os veredictos");
    expect(text).toContain("não decide nada por você");
  });

  it("says who checked and how many answers there are", () => {
    expect(text).toContain("# Conferência à mão da fidelidade (1 respostas)");
    expect(text).toContain("Verificador: qwen/teste, prompt v1.");
  });
});
