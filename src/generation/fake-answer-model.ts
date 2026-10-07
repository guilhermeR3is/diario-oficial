import type { AnswerModel } from "./answer-model";
import type { Prompt } from "./build-prompt";

export type FakeAnswerModel = AnswerModel & { readonly prompts: Prompt[] };

// pedaços curtos para os testes pegarem um "[1]" partido no meio entre dois pedaços
const DEFAULT_PIECE_LENGTH = 7;

export function createFakeAnswerModel(
  reply: string | ((prompt: Prompt) => string),
  pieceLength: number = DEFAULT_PIECE_LENGTH,
): FakeAnswerModel {
  const prompts: Prompt[] = [];

  return {
    name: "fake",
    prompts,
    async *stream(prompt: Prompt) {
      prompts.push(prompt);
      const text = typeof reply === "string" ? reply : reply(prompt);
      for (let start = 0; start < text.length; start += pieceLength) {
        yield text.slice(start, start + pieceLength);
      }
    },
  };
}
