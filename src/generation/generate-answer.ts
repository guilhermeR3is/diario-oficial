import { logger } from "@/lib/logger";
import type { SearchHit } from "@/search/search-hit";
import { type AnswerModel, ModelRateLimitError } from "./answer-model";
import { NOT_FOUND_ANSWER, PROMPT_VERSION, buildPrompt } from "./build-prompt";
import { isNotFound, parseCitations } from "./parse-citations";

export type AnswerEvent =
  | { type: "sources"; sources: SearchHit[] }
  | { type: "delta"; text: string }
  | {
      type: "done";
      answer: string;
      notFound: boolean;
      citations: number[];
      invalidCitations: number[];
      model: string;
      promptVersion: string;
      // null quando o provedor não informou o consumo
      totalTokens: number | null;
    }
  // busy: limite por minuto do provedor; quota: a cota do dia acabou
  | { type: "error"; message: string; reason: GenerationFailure };

export type GenerationFailure = "busy" | "quota" | "failed";

const FAILED: AnswerEvent = {
  type: "error",
  message: "generation failed",
  reason: "failed",
};

export async function* generateAnswer(
  model: AnswerModel,
  question: string,
  hits: SearchHit[],
): AsyncGenerator<AnswerEvent> {
  yield { type: "sources", sources: hits };

  // sem fontes não há o que perguntar ao modelo, e a chamada gastaria cota à toa
  if (hits.length === 0) {
    yield { type: "delta", text: NOT_FOUND_ANSWER };
    yield doneEvent(model, NOT_FOUND_ANSWER, 0, 0);
    return;
  }

  let answer = "";
  let totalTokens: number | undefined;
  const pieces = model.stream(buildPrompt(question, hits));
  try {
    // o for await jogaria fora o valor de retorno do gerador, que traz o consumo
    let next = await pieces.next();
    while (!next.done) {
      answer += next.value;
      yield { type: "delta", text: next.value };
      next = await pieces.next();
    }
    totalTokens = next.value;
  } catch (error) {
    logger.error({ err: error, model: model.name }, "generation failed");
    yield failureEvent(error);
    return;
  } finally {
    // quem lê parou no meio: o modelo também para, e a cota deixa de ser gasta
    await pieces.return(undefined);
  }

  if (answer.trim() === "") {
    logger.error({ model: model.name }, "model returned an empty answer");
    yield FAILED;
    return;
  }

  yield doneEvent(model, answer, hits.length, totalTokens ?? null);
}

// o erro do provedor pode trazer detalhes internos, então o cliente só recebe o motivo
function failureEvent(error: unknown): AnswerEvent {
  if (!(error instanceof ModelRateLimitError)) return FAILED;
  return {
    type: "error",
    message: "model rate limit reached",
    reason: error.window === "day" ? "quota" : "busy",
  };
}

// só no texto completo: o streaming pode partir um "[12]" no meio entre dois pedaços
function doneEvent(
  model: AnswerModel,
  answer: string,
  sourceCount: number,
  totalTokens: number | null,
): AnswerEvent {
  const { cited, invalid } = parseCitations(answer, sourceCount);
  return {
    type: "done",
    answer: answer.trim(),
    notFound: isNotFound(answer),
    citations: cited,
    invalidCitations: invalid,
    model: model.name,
    promptVersion: PROMPT_VERSION,
    totalTokens,
  };
}
