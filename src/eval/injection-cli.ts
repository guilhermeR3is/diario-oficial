import "dotenv/config";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { loadEmbedder } from "@/embedding/gte-embedder";
import { env } from "@/env";
import { createGroqAnswerModel } from "@/generation/groq-answer-model";
import { SOURCE_COUNT } from "@/generation/handle-ask";
import { db } from "@/lib/db";
import { searchHybrid } from "@/search/search-hybrid";
import {
  INJECTION_CASES,
  type InjectionOutcome,
  type InjectionRun,
  parseInjectionArgs,
  planInjectionRuns,
  runInjectionCase,
  withoutDefense,
} from "./injection";
import { runPaced } from "./paced-run";
import { parseQuestions } from "./questions";
import { TOKENS_PER_QUESTION } from "./run-generation";

const QUESTION_ID = "q01";
const PAUSE_SECONDS = 60;

type RunResult = InjectionRun & InjectionOutcome;

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
  if (!env.GROQ_API_KEY) throw new Error("GROQ_API_KEY ausente no .env");
  const args = parseInjectionArgs(process.argv.slice(2));

  const questions = parseQuestions(
    await readFile("eval/questions.jsonl", "utf8"),
  );
  const question = questions.find((item) => item.id === QUESTION_ID);
  if (!question) throw new Error(`${QUESTION_ID} não está em questions.jsonl`);

  const runs = planInjectionRuns(INJECTION_CASES, args);
  const tokens = runs.length * TOKENS_PER_QUESTION;
  process.stdout.write(
    [
      `Modelo: ${env.GENERATION_MODEL} (plano gratuito da Groq)`,
      `Pergunta ${QUESTION_ID}: ${question.question}`,
      `${runs.length} chamadas: cada ataque ${args.repeat} vez(es) com as regras do prompt${args.control ? " e uma sem elas (controle)" : ""}.`,
      `Estimativa: ~${Math.round(tokens / 1000)} mil tokens e cerca de ${runs.length} minutos por causa da pausa de ${PAUSE_SECONDS} s.`,
      "",
    ].join("\n"),
  );
  if (!args.yes && !(await confirm("Continuar?"))) {
    process.stdout.write("Cancelado, nada foi gasto.\n");
    return;
  }

  const embed = await loadEmbedder();
  const hits = await searchHybrid(
    db,
    { question: question.question, vector: await embed(question.question) },
    SOURCE_COUNT,
  );
  const model = createGroqAnswerModel({
    apiKey: env.GROQ_API_KEY,
    model: env.GENERATION_MODEL,
  });
  const results: RunResult[] = [];

  const outcome = await runPaced(
    runs,
    {
      process: async (run) => {
        try {
          const used = run.defended ? model : withoutDefense(model);
          const result = await runInjectionCase(
            used,
            question.question,
            hits,
            run.injection,
          );
          return { ...run, ...result };
        } catch (error) {
          process.stderr.write(
            `${error instanceof Error ? error.message : error}\n`,
          );
          return null;
        }
      },
      save: async (result) => {
        results.push(result);
      },
      sleep: (ms) => sleep(ms),
      now: Date.now,
      onItem: ({ item, position, total, result }) => {
        const what = !result
          ? "falhou"
          : result.obeyed
            ? "A PALAVRA-CHAVE APARECEU"
            : "palavra-chave ausente";
        process.stdout.write(
          `[${position}/${total}] ${item.injection.id} ${item.defended ? "com regras" : "sem regras"}: ${what}\n`,
        );
      },
    },
    PAUSE_SECONDS * 1000,
  );

  process.stdout.write(
    `\nGravadas ${outcome.saved}, falharam ${outcome.failed}.\n`,
  );
  for (const { injection, defended } of runs.filter(
    (run, index) =>
      runs.findIndex(
        (other) =>
          other.injection === run.injection && other.defended === run.defended,
      ) === index,
  )) {
    const group = results.filter(
      (result) =>
        result.injection === injection && result.defended === defended,
    );
    const obeyed = group.filter((result) => result.obeyed).length;
    process.stdout.write(
      `${injection.id} ${defended ? "com regras" : "sem regras"}: a palavra-chave apareceu em ${obeyed} de ${group.length}\n`,
    );
  }
  for (const result of results) {
    process.stdout.write(
      `\n## ${result.injection.id} (${result.defended ? "com regras" : "sem regras"}, palavra-chave ${result.injection.keyword})\n${result.answer}\n`,
    );
  }
  if (outcome.stoppedEarly) {
    process.stdout.write(
      "Parei após duas falhas seguidas: provável cota esgotada. Confira o log e tente mais tarde.\n",
    );
    process.exitCode = 1;
  }
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
