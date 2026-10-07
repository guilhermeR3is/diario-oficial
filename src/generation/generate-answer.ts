import { logger } from "@/lib/logger";
import type { SearchHit } from "@/search/search-hit";
import type { AnswerModel } from "./answer-model";
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
    }
  | { type: "error"; message: string };

export async function* generateAnswer(
  model: AnswerModel,
  question: string,
  hits: SearchHit[],
): AsyncGenerator<AnswerEvent> {
  yield { type: "sources", sources: hits };

  // sem fontes não há o que perguntar ao modelo, e a chamada gastaria cota à toa
  if (hits.length === 0) {
    yield { type: "delta", text: NOT_FOUND_ANSWER };
    yield doneEvent(model, NOT_FOUND_ANSWER, 0);
    return;
  }

  let answer = "";
  try {
    for await (const text of model.stream(buildPrompt(question, hits))) {
      answer += text;
      yield { type: "delta", text };
    }
  } catch (error) {
    logger.error({ err: error, model: model.name }, "generation failed");
    // o erro do provedor pode trazer detalhes internos, então o cliente só recebe isto
    yield { type: "error", message: "generation failed" };
    return;
  }

  if (answer.trim() === "") {
    logger.error({ model: model.name }, "model returned an empty answer");
    yield { type: "error", message: "generation failed" };
    return;
  }

  yield doneEvent(model, answer, hits.length);
}

// só no texto completo: o streaming pode partir um "[12]" no meio entre dois pedaços
function doneEvent(
  model: AnswerModel,
  answer: string,
  sourceCount: number,
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
  };
}
