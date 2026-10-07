import type { GenerationResult } from "./generation-result";
import { keyOf } from "./metrics";
import type { EvalQuestion } from "./questions";

export type GenerationSummary = {
  evaluated: number;
  missing: string[];
  unanswerable: { total: number; refused: number; answeredIds: string[] };
  // o trecho do gabarito está entre as fontes que o modelo recebeu
  reachable: {
    total: number;
    answered: number;
    refused: number;
    citedRelevant: number;
  };
  unreachable: { total: number; answered: number; refused: number };
  uncited: string[];
  invalidCitations: string[];
};

type Judged = {
  question: EvalQuestion;
  result: GenerationResult;
  relevantInSources: boolean;
  citedRelevant: boolean;
};

function judge(
  questions: EvalQuestion[],
  results: GenerationResult[],
): { judged: Judged[]; missing: string[] } {
  const byId = new Map(results.map((result) => [result.id, result]));
  const judged: Judged[] = [];
  const missing: string[] = [];

  for (const question of [...questions].sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    const result = byId.get(question.id);
    if (!result) {
      missing.push(question.id);
      continue;
    }
    const relevant = new Set(question.relevant.map(keyOf));
    const sourceKeys = result.sources.map(keyOf);
    judged.push({
      question,
      result,
      relevantInSources: sourceKeys.some((key) => relevant.has(key)),
      // a citação [n] aponta para sources[n - 1]
      citedRelevant: result.citations.some((n) =>
        relevant.has(sourceKeys[n - 1] ?? ""),
      ),
    });
  }
  return { judged, missing };
}

export function summarizeGeneration(
  questions: EvalQuestion[],
  results: GenerationResult[],
): GenerationSummary {
  const { judged, missing } = judge(questions, results);
  const unanswerable = judged.filter((j) => j.question.kind === "unanswerable");
  const answerable = judged.filter((j) => j.question.kind !== "unanswerable");
  const reachable = answerable.filter((j) => j.relevantInSources);
  const unreachable = answerable.filter((j) => !j.relevantInSources);
  const refused = (items: Judged[]) =>
    items.filter((j) => j.result.notFound).length;

  return {
    evaluated: judged.length,
    missing,
    unanswerable: {
      total: unanswerable.length,
      refused: refused(unanswerable),
      answeredIds: unanswerable
        .filter((j) => !j.result.notFound)
        .map((j) => j.question.id),
    },
    reachable: {
      total: reachable.length,
      answered: reachable.length - refused(reachable),
      refused: refused(reachable),
      citedRelevant: reachable.filter((j) => j.citedRelevant).length,
    },
    unreachable: {
      total: unreachable.length,
      answered: unreachable.length - refused(unreachable),
      refused: refused(unreachable),
    },
    uncited: judged
      .filter((j) => !j.result.notFound && j.result.citations.length === 0)
      .map((j) => j.question.id),
    invalidCitations: judged
      .filter((j) => j.result.invalidCitations.length > 0)
      .map((j) => j.question.id),
  };
}

export const snippet = (text: string) => {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > 100 ? `${oneLine.slice(0, 100)}...` : oneLine;
};

const list = (ids: string[]) => (ids.length === 0 ? "nenhuma" : ids.join(", "));

export function formatGenerationReport(
  questions: EvalQuestion[],
  results: GenerationResult[],
  meta: { model: string; promptVersion: string },
): string {
  const summary = summarizeGeneration(questions, results);
  const { judged } = judge(questions, results);
  const { unanswerable, reachable, unreachable } = summary;

  const rows = judged.map(
    ({ question, result, relevantInSources, citedRelevant }) => {
      const flags = [
        result.notFound ? "recusou" : "respondeu",
        question.kind === "unanswerable"
          ? "-"
          : relevantInSources
            ? "sim"
            : "não",
        question.kind === "unanswerable" || result.notFound
          ? "-"
          : citedRelevant
            ? "sim"
            : "não",
        result.invalidCitations.length > 0
          ? result.invalidCitations.join(",")
          : "-",
      ];
      return `| ${question.id} | ${question.kind} | ${flags.join(" | ")} | ${snippet(result.answer).replaceAll("|", "\\|")} |`;
    },
  );

  return [
    `Modelo: ${meta.model} | prompt ${meta.promptVersion} | ${summary.evaluated} de ${questions.length} perguntas avaliadas`,
    summary.missing.length > 0
      ? `Sem resultado ainda: ${list(summary.missing)}`
      : "",
    "",
    "## Sem resposta nos diários",
    "",
    `Recusaram corretamente: ${unanswerable.refused} de ${unanswerable.total}`,
    `Responderam em vez de recusar: ${list(unanswerable.answeredIds)}`,
    "",
    "## Com resposta nos diários",
    "",
    "| Situação | Perguntas | Responderam | Recusaram | Citaram o trecho certo |",
    "|---|---|---|---|---|",
    `| Trecho certo entre as fontes | ${reachable.total} | ${reachable.answered} | ${reachable.refused} | ${reachable.citedRelevant} |`,
    `| Trecho certo fora das fontes | ${unreachable.total} | ${unreachable.answered} | ${unreachable.refused} | - |`,
    "",
    "Recusa indevida é recusar com o trecho certo nas fontes. Responder sem o trecho certo nas fontes pode ser invenção: é o que a verificação de fidelidade confere. Citar o trecho certo não prova que a resposta está certa.",
    "",
    "## Problemas de citação",
    "",
    `Responderam sem citar nenhuma fonte válida: ${list(summary.uncited)}`,
    `Citaram um número que não existe: ${list(summary.invalidCitations)}`,
    "",
    "## Por pergunta",
    "",
    "| id | tipo | resposta | trecho certo nas fontes | citou o certo | números inválidos | início da resposta |",
    "|---|---|---|---|---|---|---|",
    ...rows,
    "",
  ].join("\n");
}
