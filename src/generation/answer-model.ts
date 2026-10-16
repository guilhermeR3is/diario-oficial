import type { Prompt } from "./build-prompt";

export type AnswerModel = {
  readonly name: string;
  // o valor de retorno do gerador é o total de tokens que a chamada gastou da cota, quando o provedor informa
  stream(prompt: Prompt): AsyncGenerator<string, number | undefined>;
};

// "minute" passa em segundos; "day" só quando a cota diária zerar
export type RateLimitWindow = "minute" | "day";

export class ModelRateLimitError extends Error {
  constructor(
    readonly window: RateLimitWindow,
    options?: { cause?: unknown },
  ) {
    super(`model rate limit reached (${window})`, options);
    this.name = "ModelRateLimitError";
  }
}
