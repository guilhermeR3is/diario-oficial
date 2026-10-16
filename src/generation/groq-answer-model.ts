import Groq, { RateLimitError } from "groq-sdk";
import { logger } from "@/lib/logger";
import {
  type AnswerModel,
  ModelRateLimitError,
  type RateLimitWindow,
} from "./answer-model";

// o gpt-oss escreve colchetes cheios, espaços e hífens sem quebra; o resto do sistema espera ASCII
// cada um tem um único code point, então a troca vale pedaço a pedaço, mesmo com o streaming partindo o texto
const PLAIN_TYPOGRAPHY = new Map<number, string>([
  [0x3010, "["], // LEFT BLACK LENTICULAR BRACKET
  [0x3011, "]"], // RIGHT BLACK LENTICULAR BRACKET
  [0xff3b, "["], // FULLWIDTH LEFT SQUARE BRACKET
  [0xff3d, "]"], // FULLWIDTH RIGHT SQUARE BRACKET
  [0x202f, " "], // NARROW NO-BREAK SPACE
  [0x00a0, " "], // NO-BREAK SPACE
  [0x2011, "-"], // NON-BREAKING HYPHEN
]);

const toPlainTypography = (text: string) =>
  Array.from(
    text,
    (char) => PLAIN_TYPOGRAPHY.get(char.codePointAt(0)!) ?? char,
  ).join("");

// o raciocínio talvez conte neste teto (a documentação não diz); 1024 deixa folga para ~350 tokens de resposta
const DEFAULT_MAX_COMPLETION_TOKENS = 1024;

// os limites por minuto (30 pedidos, 8 mil tokens) zeram em até 60 s; espera maior só pode ser do limite diário
const MINUTE_WINDOW_SECONDS = 60;

// sem o cabeçalho, supor o diário evita que o visitante gaste as perguntas dele tentando de novo
export function rateLimitWindow(retryAfter: string | null): RateLimitWindow {
  // Number("") daria 0 e passaria por limite de minuto
  const seconds = retryAfter?.trim() ? Number(retryAfter) : Number.NaN;
  return seconds >= 0 && seconds <= MINUTE_WINDOW_SECONDS ? "minute" : "day";
}

export function createGroqAnswerModel(options: {
  apiKey: string;
  model: string;
  // cada modelo tem o seu limite de saída por minuto na Groq; o do qwen é 1.000
  maxCompletionTokens?: number;
  // o SDK espera o retry-after inteiro, sem teto: no limite diário seriam horas com o visitante esperando
  maxRetries?: number;
}): AnswerModel {
  const client = new Groq({
    apiKey: options.apiKey,
    maxRetries: options.maxRetries,
  });

  return {
    name: options.model,
    async *stream(prompt) {
      const completion = await client.chat.completions
        .create({
          model: options.model,
          messages: [
            { role: "system", content: prompt.system },
            { role: "user", content: prompt.user },
          ],
          stream: true,
          max_completion_tokens:
            options.maxCompletionTokens ?? DEFAULT_MAX_COMPLETION_TOKENS,
          // só vale para modelos de raciocínio (gpt-oss); outro modelo pode recusar estes dois parâmetros
          reasoning_effort: "low",
          include_reasoning: false,
        })
        .catch((error: unknown) => {
          if (!(error instanceof RateLimitError)) throw error;
          throw new ModelRateLimitError(
            rateLimitWindow(error.headers.get("retry-after")),
            { cause: error },
          );
        });

      let finishReason: string | null = null;
      let usage: { total_tokens?: number } | null | undefined;
      for await (const chunk of completion) {
        const choice = chunk.choices[0];
        if (choice?.delta.content)
          yield toPlainTypography(choice.delta.content);
        if (choice?.finish_reason) finishReason = choice.finish_reason;
        if (chunk.x_groq?.usage) usage = chunk.x_groq.usage;
      }

      logger.info(
        { model: options.model, finishReason, usage },
        "groq completion finished",
      );
      if (finishReason === "length") {
        throw new Error("answer cut by max_completion_tokens");
      }
      return usage?.total_tokens;
    },
  };
}
