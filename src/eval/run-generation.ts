import type { AnswerModel } from "@/generation/answer-model";
import { generateAnswer } from "@/generation/generate-answer";
import type { SearchHit } from "../search/search-hit";
import { type GenerationResult, latestResults } from "./generation-result";
import type { EvalQuestion } from "./questions";

export const DEFAULT_LIMIT = 20;
export const DEFAULT_PAUSE_SECONDS = 60;

// média medida em 15 chamadas reais (5 recusas e 10 respostas): 5,1 mil por pergunta
export const TOKENS_PER_QUESTION = 5_100;

// duas falhas seguidas indicam cota esgotada ou chave inválida; seguir só gastaria o que resta
const MAX_CONSECUTIVE_FAILURES = 2;

export type GenerationArgs = {
  limit: number;
  pauseSeconds: number;
  reportOnly: boolean;
  yes: boolean;
  redo: string[];
};

export function parseGenerationArgs(args: string[]): GenerationArgs {
  const parsed: GenerationArgs = {
    limit: DEFAULT_LIMIT,
    pauseSeconds: DEFAULT_PAUSE_SECONDS,
    reportOnly: false,
    yes: false,
    redo: [],
  };

  for (const arg of args) {
    if (arg === "--report") parsed.reportOnly = true;
    else if (arg === "--yes") parsed.yes = true;
    else if (arg.startsWith("--limit=")) {
      parsed.limit = positiveInteger("--limit", arg.slice("--limit=".length));
    } else if (arg.startsWith("--redo=")) {
      parsed.redo = questionIds(arg.slice("--redo=".length));
    } else if (arg.startsWith("--pause-seconds=")) {
      parsed.pauseSeconds = positiveInteger(
        "--pause-seconds",
        arg.slice("--pause-seconds=".length),
      );
    } else {
      throw new Error(
        `argumento desconhecido "${arg}" (use --limit=N, --pause-seconds=N, --redo=q04,q05, --report, --yes)`,
      );
    }
  }
  return parsed;
}

function questionIds(text: string): string[] {
  const ids = text.split(",").map((id) => id.trim());
  if (ids.some((id) => !/^q\d{2}$/.test(id))) {
    throw new Error(`--redo deve listar ids como q04,q05 (recebi "${text}")`);
  }
  return [...new Set(ids)];
}

function positiveInteger(name: string, text: string): number {
  const value = Number(text);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(
      `${name} deve ser um inteiro maior que zero (recebi "${text}")`,
    );
  }
  return value;
}

export function pendingQuestions(
  questions: EvalQuestion[],
  results: GenerationResult[],
  current: { model: string; promptVersion: string },
  { limit, redo = [] }: { limit?: number; redo?: string[] } = {},
): EvalQuestion[] {
  const known = new Set(questions.map((question) => question.id));
  const unknown = redo.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new Error(
      `--redo: ${unknown.join(", ")} não está em eval/questions.jsonl`,
    );
  }

  // uma pergunta refeita entra de novo; a linha nova vale mais que a antiga (latestResults)
  const done = new Set(latestResults(results, current).keys());
  for (const id of redo) done.delete(id);
  const pending = questions
    .filter((question) => !done.has(question.id))
    // as sem resposta primeiro: são o teste mais importante e cabem na cota do primeiro dia
    .sort(
      (a, b) =>
        Number(b.kind === "unanswerable") - Number(a.kind === "unanswerable") ||
        a.id.localeCompare(b.id),
    );
  return limit === undefined ? pending : pending.slice(0, limit);
}

// null quando o modelo falhou; o motivo já foi para o log dentro de generateAnswer
export async function generateForQuestion(
  question: EvalQuestion,
  hits: SearchHit[],
  model: AnswerModel,
): Promise<GenerationResult | null> {
  for await (const event of generateAnswer(model, question.question, hits)) {
    if (event.type === "error") return null;
    if (event.type === "done") {
      return {
        id: question.id,
        model: event.model,
        promptVersion: event.promptVersion,
        answer: event.answer,
        notFound: event.notFound,
        citations: event.citations,
        invalidCitations: event.invalidCitations,
        sources: hits.map((hit) => ({
          sourceUrl: hit.edition.sourceUrl,
          ordinal: hit.ordinal,
        })),
      };
    }
  }
  throw new Error("generateAnswer terminou sem evento done nem error");
}

export type RunDeps = {
  model: AnswerModel;
  vectorOf: (question: string) => Promise<number[]>;
  search: (query: {
    question: string;
    vector: number[];
  }) => Promise<SearchHit[]>;
  save: (result: GenerationResult) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  onQuestion: (outcome: {
    question: EvalQuestion;
    position: number;
    total: number;
    result: GenerationResult | null;
  }) => void;
};

export async function runPending(
  pending: EvalQuestion[],
  deps: RunDeps,
  pauseMs: number,
): Promise<{ saved: number; failed: number; stoppedEarly: boolean }> {
  let saved = 0;
  let failed = 0;
  let consecutiveFailures = 0;

  for (const [index, question] of pending.entries()) {
    const startedAt = deps.now();
    const vector = await deps.vectorOf(question.question);
    const hits = await deps.search({ question: question.question, vector });
    const result = await generateForQuestion(question, hits, deps.model);

    if (result) {
      await deps.save(result);
      saved += 1;
      consecutiveFailures = 0;
    } else {
      failed += 1;
      consecutiveFailures += 1;
    }
    deps.onQuestion({
      question,
      position: index + 1,
      total: pending.length,
      result,
    });

    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      return { saved, failed, stoppedEarly: true };
    }
    // o limite da Groq é de tokens por minuto: a pausa conta a partir do início da pergunta
    if (index < pending.length - 1) {
      await deps.sleep(Math.max(0, pauseMs - (deps.now() - startedAt)));
    }
  }
  return { saved, failed, stoppedEarly: false };
}
