import type { AnswerModel } from "@/generation/answer-model";
import { generateAnswer } from "@/generation/generate-answer";
import type { SearchHit } from "../search/search-hit";
import { type GenerationResult, latestResults } from "./generation-result";
import { runPaced } from "./paced-run";
import type { EvalQuestion } from "./questions";

export const DEFAULT_LIMIT = 20;
export const DEFAULT_PAUSE_SECONDS = 60;

// média medida em 15 chamadas reais (5 recusas e 10 respostas): 5,1 mil por pergunta
export const TOKENS_PER_QUESTION = 5_100;

export type GenerationArgs = {
  limit: number;
  pauseSeconds: number;
  reportOnly: boolean;
  yes: boolean;
  redo: string[];
  promptVersion: string | null;
  only: string[];
};

export function parseGenerationArgs(
  args: string[],
  defaults: { limit?: number; pauseSeconds?: number } = {},
): GenerationArgs {
  const parsed: GenerationArgs = {
    limit: defaults.limit ?? DEFAULT_LIMIT,
    pauseSeconds: defaults.pauseSeconds ?? DEFAULT_PAUSE_SECONDS,
    reportOnly: false,
    yes: false,
    redo: [],
    promptVersion: null,
    only: [],
  };

  for (const arg of args) {
    if (arg === "--report") parsed.reportOnly = true;
    else if (arg === "--yes") parsed.yes = true;
    else if (arg.startsWith("--limit=")) {
      parsed.limit = positiveInteger("--limit", arg.slice("--limit=".length));
    } else if (arg.startsWith("--redo=")) {
      parsed.redo = questionIds(arg.slice("--redo=".length));
    } else if (arg.startsWith("--only=")) {
      parsed.only = questionIds(arg.slice("--only=".length), "--only");
    } else if (arg.startsWith("--prompt-version=")) {
      parsed.promptVersion = promptVersion(
        arg.slice("--prompt-version=".length),
      );
    } else if (arg.startsWith("--pause-seconds=")) {
      parsed.pauseSeconds = positiveInteger(
        "--pause-seconds",
        arg.slice("--pause-seconds=".length),
      );
    } else {
      throw new Error(
        `argumento desconhecido "${arg}" (use --limit=N, --pause-seconds=N, --redo=q04,q05, --only=q26,q27, --prompt-version=v1, --report, --yes)`,
      );
    }
  }
  return parsed;
}

function questionIds(text: string, name = "--redo"): string[] {
  const ids = text.split(",").map((id) => id.trim());
  if (ids.some((id) => !/^q\d{2}$/.test(id))) {
    throw new Error(`${name} deve listar ids como q04,q05 (recebi "${text}")`);
  }
  return [...new Set(ids)];
}

function promptVersion(text: string): string {
  if (!/^v\d+$/.test(text)) {
    throw new Error(`--prompt-version deve ser como v1 (recebi "${text}")`);
  }
  return text;
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

export function runPending(
  pending: EvalQuestion[],
  deps: RunDeps,
  pauseMs: number,
) {
  return runPaced(
    pending,
    {
      process: async (question) => {
        const vector = await deps.vectorOf(question.question);
        const hits = await deps.search({ question: question.question, vector });
        return generateForQuestion(question, hits, deps.model);
      },
      save: deps.save,
      sleep: deps.sleep,
      now: deps.now,
      onItem: ({ item, position, total, result }) =>
        deps.onQuestion({ question: item, position, total, result }),
    },
    pauseMs,
  );
}
