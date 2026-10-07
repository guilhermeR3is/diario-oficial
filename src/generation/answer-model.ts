import type { Prompt } from "./build-prompt";

export type AnswerModel = {
  readonly name: string;
  stream(prompt: Prompt): AsyncIterable<string>;
};
