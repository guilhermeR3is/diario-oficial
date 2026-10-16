import "dotenv/config";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { loadEmbedder } from "@/embedding/gte-embedder";
import { env } from "@/env";
import { assertAllChunksHaveTheModelVector } from "@/eval/assert-chunk-vectors";
import { parseQuestions } from "@/eval/questions";
import {
  DEFAULT_PAUSE_SECONDS,
  TOKENS_PER_QUESTION,
} from "@/eval/run-generation";
import { PROMPT_VERSION } from "@/generation/build-prompt";
import { createGroqAnswerModel } from "@/generation/groq-answer-model";
import { SOURCE_COUNT } from "@/generation/handle-ask";
import { db } from "@/lib/db";
import { searchHybrid } from "@/search/search-hybrid";
import {
  exampleQuestions,
  generateExamples,
  saveExamples,
} from "./generate-examples";

const QUESTIONS_FILE = "eval/questions.jsonl";

async function confirm(message: string): Promise<boolean> {
  const terminal = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = await terminal.question(`${message} [s/N] `);
    return answer.trim().toLowerCase() === "s";
  } finally {
    terminal.close();
  }
}

async function main() {
  const unknown = process.argv.slice(2).filter((arg) => arg !== "--yes");
  if (unknown.length > 0) throw new Error(`Opção desconhecida: ${unknown[0]}`);
  const yes = process.argv.includes("--yes");
  if (!env.GROQ_API_KEY) throw new Error("GROQ_API_KEY ausente no .env");

  const examples = exampleQuestions(
    parseQuestions(await readFile(QUESTIONS_FILE, "utf8")),
  );
  const tokens = examples.length * TOKENS_PER_QUESTION;
  const minutes = Math.ceil(
    ((examples.length - 1) * DEFAULT_PAUSE_SECONDS) / 60,
  );
  process.stdout.write(
    [
      `Modelo: ${env.GENERATION_MODEL}, prompt ${PROMPT_VERSION} (plano gratuito da Groq: 200 mil tokens por dia e 8 mil por minuto)`,
      `Vou gerar ${examples.length} respostas de exemplo e trocar as que estão no banco: ${examples.map((example) => example.slug).join(", ")}.`,
      `Estimativa: ~${Math.round(tokens / 1000)} mil tokens (cerca de ${TOKENS_PER_QUESTION} por pergunta) e uns ${minutes} minutos, por causa da pausa de ${DEFAULT_PAUSE_SECONDS} s entre perguntas.`,
      "Se alguma falhar, nada é gravado. Se você já usou a cota hoje, some o que gastou.",
      "",
    ].join("\n"),
  );
  if (!yes && !(await confirm("Continuar?"))) {
    process.stdout.write("Cancelado, nada foi gasto.\n");
    return;
  }

  await assertAllChunksHaveTheModelVector(db);
  const embed = await loadEmbedder();
  const generated = await generateExamples(
    examples,
    {
      // sem novas tentativas: o SDK esperaria o retry-after inteiro, horas no limite diário
      model: createGroqAnswerModel({
        apiKey: env.GROQ_API_KEY,
        model: env.GENERATION_MODEL,
        maxRetries: 0,
      }),
      vectorOf: embed,
      search: (query) => searchHybrid(db, query, SOURCE_COUNT),
      sleep: (ms) => sleep(ms),
      now: () => new Date(),
      onExample: (example) =>
        process.stdout.write(
          `[${example.position}/${examples.length}] ${example.questionSlug}: ${example.answer}\n\n`,
        ),
    },
    DEFAULT_PAUSE_SECONDS * 1000,
  );
  await saveExamples(db, generated);
  process.stdout.write(`Gravados ${generated.length} exemplos.\n`);
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
