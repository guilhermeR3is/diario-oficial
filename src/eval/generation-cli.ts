import "dotenv/config";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { loadEmbedder } from "@/embedding/gte-embedder";
import { env } from "@/env";
import { PROMPT_VERSION } from "@/generation/build-prompt";
import { createGroqAnswerModel } from "@/generation/groq-answer-model";
import { SOURCE_COUNT } from "@/generation/handle-ask";
import { db } from "@/lib/db";
import { searchHybrid } from "@/search/search-hybrid";
import { assertAllChunksHaveTheModelVector } from "./assert-chunk-vectors";
import { formatGenerationReport } from "./generation-report";
import { appendResult, latestResults, readResults } from "./generation-result";
import { type EvalQuestion, parseQuestions } from "./questions";
import {
  type GenerationArgs,
  TOKENS_PER_QUESTION,
  parseGenerationArgs,
  pendingQuestions,
  runPending,
} from "./run-generation";

const QUESTIONS_FILE = "eval/questions.jsonl";
const RESULTS_FILE = "data/eval/generation.jsonl";

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

async function evaluate(
  questions: EvalQuestion[],
  current: { model: string; promptVersion: string },
  args: GenerationArgs,
) {
  const pending = pendingQuestions(
    questions,
    await readResults(RESULTS_FILE),
    current,
    { limit: args.limit, redo: args.redo },
  );
  if (pending.length === 0) {
    process.stdout.write("Nada pendente para este modelo e este prompt.\n");
    return;
  }
  if (!env.GROQ_API_KEY) throw new Error("GROQ_API_KEY ausente no .env");

  const tokens = pending.length * TOKENS_PER_QUESTION;
  const minutes = Math.ceil((pending.length * args.pauseSeconds) / 60);
  const duration = minutes === 1 ? "1 minuto" : `${minutes} minutos`;
  process.stdout.write(
    [
      `Modelo: ${current.model} (plano gratuito da Groq: 200 mil tokens por dia e 8 mil por minuto)`,
      `Vou perguntar ${pending.length} de ${questions.length} perguntas, as sem resposta primeiro.`,
      `Estimativa: ~${Math.round(tokens / 1000)} mil tokens (cerca de ${TOKENS_PER_QUESTION} por pergunta, média de chamadas reais) e cerca de ${duration} por causa da pausa de ${args.pauseSeconds} s.`,
      "Se você já rodou hoje, some o que gastou; a hora em que a cota diária zera não foi verificada.",
      "",
    ].join("\n"),
  );
  if (!args.yes && !(await confirm("Continuar?"))) {
    process.stdout.write("Cancelado, nada foi gasto.\n");
    return;
  }

  await assertAllChunksHaveTheModelVector(db);
  const embed = await loadEmbedder();
  const outcome = await runPending(
    pending,
    {
      model: createGroqAnswerModel({
        apiKey: env.GROQ_API_KEY,
        model: current.model,
      }),
      vectorOf: embed,
      search: (query) => searchHybrid(db, query, SOURCE_COUNT),
      save: (result) => appendResult(RESULTS_FILE, result),
      sleep: (ms) => sleep(ms),
      now: Date.now,
      onQuestion: ({ question, position, total, result }) => {
        const what = !result
          ? "falhou (o motivo está no log acima)"
          : result.notFound
            ? "recusou"
            : `respondeu, citou [${result.citations.join(", ")}]`;
        process.stdout.write(`[${position}/${total}] ${question.id} ${what}\n`);
      },
    },
    args.pauseSeconds * 1000,
  );

  process.stdout.write(
    `\nGravadas ${outcome.saved}, falharam ${outcome.failed}.\n`,
  );
  if (outcome.stoppedEarly) {
    process.stdout.write(
      "Parei após duas falhas seguidas: provável cota esgotada ou chave inválida. Confira o log e tente mais tarde.\n",
    );
    process.exitCode = 1;
  }
}

async function main() {
  const args = parseGenerationArgs(process.argv.slice(2));
  const questions = parseQuestions(await readFile(QUESTIONS_FILE, "utf8"));
  const current = {
    model: env.GENERATION_MODEL,
    promptVersion: PROMPT_VERSION,
  };

  if (!args.reportOnly) await evaluate(questions, current, args);

  const latest = [
    ...latestResults(await readResults(RESULTS_FILE), current).values(),
  ];
  process.stdout.write(
    `\n${formatGenerationReport(questions, latest, current)}`,
  );
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
