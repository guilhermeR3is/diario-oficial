import { z } from "zod";
import { logger } from "@/lib/logger";
import { searchRequestSchema } from "@/search/handle-search";
import type { SearchHit } from "@/search/search-hit";
import type { AnswerModel } from "./answer-model";
import { type AnswerEvent, generateAnswer } from "./generate-answer";

export const SOURCE_COUNT = 6;

const MAX_QUESTION_LENGTH = 500;

const askRequestSchema = searchRequestSchema.extend({
  question: z.string().trim().min(1).max(MAX_QUESTION_LENGTH),
});

export type AskDependencies = {
  // sem modelo (LIVE_MODE=off) não há resposta ao vivo
  model: AnswerModel | null;
  search: (query: {
    question: string;
    vector: number[];
  }) => Promise<SearchHit[]>;
};

export type AskOutcome =
  | { status: 200; events: AsyncGenerator<AnswerEvent> }
  | { status: 400 | 500 | 503; body: { error: string } };

export async function handleAskRequest(
  { model, search }: AskDependencies,
  payload: unknown,
): Promise<AskOutcome> {
  if (!model) {
    return { status: 503, body: { error: "live answers are turned off" } };
  }

  const request = askRequestSchema.safeParse(payload);
  if (!request.success) {
    return { status: 400, body: { error: z.prettifyError(request.error) } };
  }

  const { question, vector } = request.data;
  let hits: SearchHit[];
  try {
    hits = await search({ question, vector });
  } catch (error) {
    logger.error({ err: error }, "search failed");
    return { status: 500, body: { error: "search failed" } };
  }

  return { status: 200, events: generateAnswer(model, question, hits) };
}
