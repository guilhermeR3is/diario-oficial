import Groq from "groq-sdk";
import { logger } from "@/lib/logger";
import type { AnswerModel } from "./answer-model";

// o raciocínio talvez conte neste teto (a documentação não diz); 1024 deixa folga para ~350 tokens de resposta
const MAX_COMPLETION_TOKENS = 1024;

export function createGroqAnswerModel(options: {
  apiKey: string;
  model: string;
}): AnswerModel {
  const client = new Groq({ apiKey: options.apiKey });

  return {
    name: options.model,
    async *stream(prompt) {
      const completion = await client.chat.completions.create({
        model: options.model,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
        stream: true,
        max_completion_tokens: MAX_COMPLETION_TOKENS,
        // só vale para modelos de raciocínio (gpt-oss); outro modelo pode recusar estes dois parâmetros
        reasoning_effort: "low",
        include_reasoning: false,
      });

      let finishReason: string | null = null;
      let usage: unknown;
      for await (const chunk of completion) {
        const choice = chunk.choices[0];
        if (choice?.delta.content) yield choice.delta.content;
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
    },
  };
}
