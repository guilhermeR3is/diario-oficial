import {
  RECALL_AT,
  bootstrapInterval,
  differences,
  mean,
  reciprocalRankScores,
  recallScores,
} from "./metrics";
import { METHODS, type Method, type RetrievalRun } from "./run-retrieval";

const LABELS: Record<Method, string> = {
  vector: "só vetorial",
  text: "só textual",
  hybrid: "híbrida",
};

const number = (value: number) => value.toFixed(2).replace(".", ",");
const signed = (value: number) =>
  (value >= 0 ? "+" : "−") + number(Math.abs(value));
const interval = ([low, high]: [number, number], format = number) =>
  `[${format(low)}; ${format(high)}]`;

type Scores = { recall: number[]; mrr: number[] };

function scoresOf(ranks: (number | null)[]): Scores {
  return { recall: recallScores(ranks), mrr: reciprocalRankScores(ranks) };
}

const cell = (values: number[]) =>
  `${number(mean(values))} ${interval(bootstrapInterval(values))}`;

function table(header: string[], rows: string[][]) {
  const line = (cells: string[]) => `| ${cells.join(" | ")} |`;
  return [line(header), line(header.map(() => "---")), ...rows.map(line)].join(
    "\n",
  );
}

export function formatReport(run: RetrievalRun): string {
  const scores = Object.fromEntries(
    METHODS.map((method) => [method, scoresOf(run.ranks[method])]),
  ) as Record<Method, Scores>;
  const recallLabel = `recall@${RECALL_AT}`;

  const overall = table(
    ["Busca", recallLabel, "MRR"],
    METHODS.map((method) => [
      LABELS[method],
      cell(scores[method].recall),
      cell(scores[method].mrr),
    ]),
  );

  const pairs: [Method, Method][] = [
    ["hybrid", "vector"],
    ["hybrid", "text"],
    ["text", "vector"],
  ];
  const paired = table(
    ["Comparação", recallLabel, "MRR"],
    pairs.map(([a, b]) => {
      const cellOf = (pick: (s: Scores) => number[]) => {
        const diff = differences(pick(scores[a]), pick(scores[b]));
        return `${signed(mean(diff))} ${interval(bootstrapInterval(diff), signed)}`;
      };
      return [
        `${LABELS[a]} − ${LABELS[b]}`,
        cellOf((s) => s.recall),
        cellOf((s) => s.mrr),
      ];
    }),
  );

  const kinds = [...new Set(run.questions.map((question) => question.kind))];
  const byKind = table(
    [
      "Tipo",
      "Perguntas",
      ...METHODS.map((method) => `${LABELS[method]} (${recallLabel} / MRR)`),
    ],
    kinds.map((kind) => {
      const positions = run.questions.flatMap((q, i) =>
        q.kind === kind ? [i] : [],
      );
      const pick = (values: number[]) => positions.map((i) => values[i]!);
      return [
        kind,
        String(positions.length),
        ...METHODS.map(
          (method) =>
            `${number(mean(pick(scores[method].recall)))} / ${number(mean(pick(scores[method].mrr)))}`,
        ),
      ];
    }),
  );

  const perQuestion = table(
    ["Pergunta", "Tipo", ...METHODS.map((method) => LABELS[method])],
    run.questions.map((question, i) => [
      question.id,
      question.kind,
      ...METHODS.map((method) => String(run.ranks[method][i] ?? "–")),
    ]),
  );

  return (
    [
      `## Resultado geral (${run.questions.length} perguntas com resposta)`,
      overall,
      `Entre colchetes, o intervalo de 95% por reamostragem (bootstrap, 10.000 rodadas).`,
      `## Diferença entre as buscas (mesmas perguntas, par a par)`,
      paired,
      `## Por tipo de pergunta`,
      byKind,
      `## Por pergunta (posição do primeiro trecho relevante entre os 10 primeiros; – = não apareceu)`,
      perQuestion,
    ].join("\n\n") + "\n"
  );
}
