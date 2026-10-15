import { z } from "zod";
import { logger } from "@/lib/logger";
import { searchRequestSchema } from "@/search/handle-search";
import type { SearchHit } from "@/search/search-hit";
import type { AnswerModel } from "./answer-model";
import { type AnswerEvent, generateAnswer } from "./generate-answer";
import type { QueryRecord } from "./query-log";

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

export type AskEvent =
  | Exclude<AnswerEvent, { type: "sources" | "done" }>
  | { type: "sources"; sources: SearchHit[]; searchMode: SearchMode }
  // queryId null: a resposta saiu, mas o registro falhou e não há onde gravar o feedback
  | (DoneEvent & { queryId: string | null });

export type AskDependencies = {
  // sem modelo (LIVE_MODE=off) não há resposta ao vivo
  model: AnswerModel | null;
  searchHybrid: (query: {
    question: string;
    vector: number[];
  }) => Promise<SearchHit[]>;
  // reserva para quando o navegador do visitante não conseguiu calcular o vetor
  searchText: (question: string) => Promise<SearchHit[]>;
  recordQuery: (record: QueryRecord) => Promise<string>;
  now: () => number;
};

export type AskOutcome =
  | { status: 200; events: AsyncGenerator<AskEvent> }
  | { status: 400 | 500 | 503; body: { error: string } };

export async function handleAskRequest(
  { model, searchHybrid, searchText, recordQuery, now }: AskDependencies,
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

  const { question, vector } = request.data;
  const searchMode: SearchMode = vector ? "hybrid" : "text";
  let hits: SearchHit[];
  try {
    hits = vector
      ? await searchHybrid({ question, vector })
      : await searchText(question);
  } catch (error) {
    logger.error({ err: error, searchMode }, "search failed");
    return { status: 500, body: { error: "search failed" } };
  }

  return {
    status: 200,
    events: finishAsk(generateAnswer(model, question, hits), {
      question,
      searchMode,
      hits,
      recordQuery,
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
    latencyMs: () => number;
  },
): AsyncGenerator<AskEvent> {
  for await (const event of events) {
    if (event.type === "sources") {
      yield { ...event, searchMode: context.searchMode };
    } else if (event.type === "done") {
      yield { ...event, queryId: await record(event, context) };
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
    });
  } catch (error) {
    // o visitante já tem a resposta; perder o registro só desliga o feedback dela
    logger.error({ err: error }, "query log failed");
    return null;
  }
}
