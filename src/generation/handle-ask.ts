import { z } from "zod";
import type { SlotOutcome } from "@/limits/live-limits";
import { logger } from "@/lib/logger";
import { searchRequestSchema } from "@/search/handle-search";
import type { SearchHit } from "@/search/search-hit";
import type { AnswerModel } from "./answer-model";
import {
  type AnswerEvent,
  describeError,
  generateAnswer,
} from "./generate-answer";
import type { FailureRecord, QueryRecord } from "./query-log";

export const SOURCE_COUNT = 6;

const MAX_QUESTION_LENGTH = 500;

export type SearchMode = "hybrid" | "text";

const askRequestSchema = z
  .object({
    question: z.string().trim().min(1).max(MAX_QUESTION_LENGTH),
    model: searchRequestSchema.shape.model.optional(),
    vector: searchRequestSchema.shape.vector.optional(),
  })
  // o nome do modelo é o que garante que o vetor se compara com os dos trechos
  .refine(
    (request) =>
      (request.model === undefined) === (request.vector === undefined),
    {
      message: "model and vector must be sent together",
      path: ["vector"],
    },
  );

type DoneEvent = Extract<AnswerEvent, { type: "done" }>;

type ErrorEvent = Extract<AnswerEvent, { type: "error" }>;

export type AskEvent =
  | Exclude<AnswerEvent, { type: "sources" | "done" | "error" }>
  | { type: "sources"; sources: SearchHit[]; searchMode: SearchMode }
  // a mensagem do provedor pode trazer detalhes internos: fica no registro de falhas e o visitante só recebe o motivo
  | Omit<ErrorEvent, "detail">
  // queryId null: a resposta saiu, mas o registro falhou e não há onde gravar o feedback
  | (DoneEvent & { queryId: string | null });

// o hash do visitante é acrescentado por quem conhece o pedido HTTP (a rota)
export type AskRecord = Omit<QueryRecord, "visitorHash">;
export type AskFailure = Omit<FailureRecord, "visitorHash">;

export type AskDependencies = {
  // sem modelo (LIVE_MODE=off) não há resposta ao vivo
  model: AnswerModel | null;
  searchHybrid: (query: {
    question: string;
    vector: number[];
  }) => Promise<SearchHit[]>;
  // reserva para quando o navegador do visitante não conseguiu calcular o vetor
  searchText: (question: string) => Promise<SearchHit[]>;
  // conta a pergunta para o visitante e para o site antes de qualquer gasto; a vaga não volta se algo falhar depois
  reserveSlot: () => Promise<SlotOutcome>;
  // a cota diária do modelo acabou: os próximos visitantes já recebem 503, sem gastar uma pergunta
  closeDay: () => Promise<void>;
  recordQuery: (record: AskRecord) => Promise<string>;
  // o log da Vercel Hobby dura 1 hora; a falha gravada no banco ainda explica o erro no dia seguinte
  recordFailure: (failure: AskFailure) => Promise<void>;
  now: () => number;
};

export type AskOutcome =
  | { status: 200; events: AsyncGenerator<AskEvent> }
  | { status: 400 | 429 | 500 | 503; body: { error: string } };

export async function handleAskRequest(
  {
    model,
    searchHybrid,
    searchText,
    reserveSlot,
    closeDay,
    recordQuery,
    recordFailure,
    now,
  }: AskDependencies,
  payload: unknown,
): Promise<AskOutcome> {
  const startedAt = now();
  if (!model) {
    return { status: 503, body: { error: "live answers are turned off" } };
  }

  const request = askRequestSchema.safeParse(payload);
  if (!request.success) {
    return { status: 400, body: { error: z.prettifyError(request.error) } };
  }

  let slot: SlotOutcome;
  try {
    slot = await reserveSlot();
  } catch (error) {
    logger.error({ err: error }, "live slot reservation failed");
    return { status: 500, body: { error: "could not check the daily limit" } };
  }
  if (slot === "visitor-limit") {
    return { status: 429, body: { error: "visitor daily limit reached" } };
  }
  if (slot === "site-limit") {
    return { status: 503, body: { error: "site daily limit reached" } };
  }

  const { question, vector } = request.data;
  const searchMode: SearchMode = vector ? "hybrid" : "text";
  let hits: SearchHit[];
  try {
    hits = vector
      ? await searchHybrid({ question, vector })
      : await searchText(question);
  } catch (error) {
    logger.error({ err: error, searchMode }, "search failed");
    await recordFailureLogged(recordFailure, {
      stage: "search",
      reason: "failed",
      detail: describeError(error),
      searchMode,
    });
    return { status: 500, body: { error: "search failed" } };
  }

  return {
    status: 200,
    events: finishAsk(generateAnswer(model, question, hits), {
      question,
      searchMode,
      hits,
      recordQuery,
      recordFailure,
      closeDay,
      latencyMs: () => Math.round(now() - startedAt),
    }),
  };
}

async function* finishAsk(
  events: AsyncGenerator<AnswerEvent>,
  context: {
    question: string;
    searchMode: SearchMode;
    hits: SearchHit[];
    recordQuery: AskDependencies["recordQuery"];
    recordFailure: AskDependencies["recordFailure"];
    closeDay: AskDependencies["closeDay"];
    latencyMs: () => number;
  },
): AsyncGenerator<AskEvent> {
  for await (const event of events) {
    if (event.type === "sources") {
      yield { ...event, searchMode: context.searchMode };
    } else if (event.type === "done") {
      yield { ...event, queryId: await record(event, context) };
    } else if (event.type === "error") {
      if (event.reason === "quota") await closeDayLogged(context.closeDay);
      await recordFailureLogged(context.recordFailure, {
        stage: "generation",
        reason: event.reason,
        detail: event.detail,
        searchMode: context.searchMode,
      });
      yield { type: "error", message: event.message, reason: event.reason };
    } else {
      yield event;
    }
  }
}

async function record(
  done: DoneEvent,
  context: Parameters<typeof finishAsk>[1],
): Promise<string | null> {
  try {
    return await context.recordQuery({
      question: context.question,
      searchMode: context.searchMode,
      retrievedChunkIds: context.hits.map((hit) => hit.chunkId),
      answer: done.answer,
      model: done.model,
      promptVersion: done.promptVersion,
      latencyMs: context.latencyMs(),
      totalTokens: done.totalTokens,
    });
  } catch (error) {
    // o visitante já tem a resposta; perder o registro só desliga o feedback dela
    logger.error({ err: error }, "query log failed");
    return null;
  }
}

async function recordFailureLogged(
  recordFailure: AskDependencies["recordFailure"],
  failure: AskFailure,
) {
  try {
    await recordFailure(failure);
  } catch (error) {
    // o visitante recebe o erro mesmo assim; só o diagnóstico se perde
    logger.error({ err: error }, "failure log failed");
  }
}

async function closeDayLogged(closeDay: AskDependencies["closeDay"]) {
  try {
    await closeDay();
  } catch (error) {
    // sem o dia fechado, o próximo visitante gasta uma pergunta para receber o mesmo 429
    logger.error({ err: error }, "closing the live day failed");
  }
}
