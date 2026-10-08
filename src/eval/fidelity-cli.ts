import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createInterface } from "node:readline/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { env } from "@/env";
import { PROMPT_VERSION } from "@/generation/build-prompt";
import { createGroqAnswerModel } from "@/generation/groq-answer-model";
import { db } from "@/lib/db";
import { loadChunkIndex } from "./chunk-index";
import { FIDELITY_PROMPT_VERSION } from "./fidelity-prompt";
import {
  type SampleCase,
  formatFidelityReport,
  formatSample,
  pickSample,
} from "./fidelity-report";
import { appendFidelityResult, readFidelityResults } from "./fidelity-result";
import { latestResults, readResults } from "./generation-result";
import type { GenerationResult } from "./generation-result";
import { keyOf } from "./metrics";
import { runPaced } from "./paced-run";
import { type EvalQuestion, parseQuestions } from "./questions";
import { parseGenerationArgs } from "./run-generation";
import {
  TOKENS_PER_CHECK,
  checkFidelity,
  currentChecks,
  pendingFidelity,
} from "./run-fidelity";

const QUESTIONS_FILE = "eval/questions.jsonl";
const GENERATION_FILE = "data/eval/generation.jsonl";
const FIDELITY_FILE = "data/eval/fidelity.jsonl";
const SAMPLE_FILE = "data/eval/fidelity-sample.md";

// uma conferência é bem menor que uma geração: sem os 6 trechos, só os citados
const DEFAULTS = { limit: 30, pauseSeconds: 30 };

// o qwen recusa pedidos de saída acima de 1.000 por minuto (429 em 07/10/2026); com o prompt v2 o raciocínio chegou a 800 e cortou a q11
const VERIFIER_MAX_OUTPUT_TOKENS = 950;

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

async function chunkTexts() {
  const index = await loadChunkIndex(db);
  return new Map(index.map((chunk) => [keyOf(chunk), chunk.text]));
}

async function evaluate(
  generations: GenerationResult[],
  current: { verifier: string; promptVersion: string },
  args: ReturnType<typeof parseGenerationArgs>,
) {
  const pending = pendingFidelity(
    generations,
    await readFidelityResults(FIDELITY_FILE),
    current,
    { limit: args.limit, redo: args.redo },
  );
  if (pending.length === 0) {
    process.stdout.write(
      "Nada pendente para este verificador e este prompt.\n",
    );
    return;
  }
  if (!env.GROQ_API_KEY) throw new Error("GROQ_API_KEY ausente no .env");

  const tokens = pending.length * TOKENS_PER_CHECK;
  const minutes = Math.ceil((pending.length * args.pauseSeconds) / 60);
  const duration = minutes === 1 ? "1 minuto" : `${minutes} minutos`;
  process.stdout.write(
    [
      `Verificador: ${current.verifier} (plano gratuito da Groq; a cota própria deste modelo não foi confirmada)`,
      `Vou conferir ${pending.length} respostas, uma chamada por resposta.`,
      `Estimativa: ~${Math.round(tokens / 1000)} mil tokens (cerca de ${TOKENS_PER_CHECK} por resposta, entrada medida e saída estimada) e cerca de ${duration} por causa da pausa de ${args.pauseSeconds} s.`,
      "",
    ].join("\n"),
  );
  if (!args.yes && !(await confirm("Continuar?"))) {
    process.stdout.write("Cancelado, nada foi gasto.\n");
    return;
  }

  const texts = await chunkTexts();
  const verifier = createGroqAnswerModel({
    apiKey: env.GROQ_API_KEY,
    model: current.verifier,
    maxCompletionTokens: VERIFIER_MAX_OUTPUT_TOKENS,
  });
  const outcome = await runPaced(
    pending,
    {
      process: (generation) =>
        checkFidelity(generation, {
          verifier,
          textOf: (key) => texts.get(keyOf(key)),
        }),
      save: (result) => appendFidelityResult(FIDELITY_FILE, result),
      sleep: (ms) => sleep(ms),
      now: Date.now,
      onItem: ({ item, position, total, result }) => {
        const what = !result
          ? "falhou (o motivo está no log acima)"
          : `${result.claims.filter((c) => c.supported).length} de ${result.claims.length} afirmações sustentadas`;
        process.stdout.write(`[${position}/${total}] ${item.id} ${what}\n`);
      },
    },
    args.pauseSeconds * 1000,
  );

  process.stdout.write(
    `\nGravadas ${outcome.saved}, falharam ${outcome.failed}.\n`,
  );
  if (outcome.stoppedEarly) {
    process.stdout.write(
      "Parei após duas falhas seguidas: provável cota esgotada, chave inválida ou modelo que recusa os parâmetros. Confira o log e tente mais tarde.\n",
    );
    process.exitCode = 1;
  }
}

async function writeSample(
  checks: ReturnType<typeof currentChecks>,
  generations: GenerationResult[],
  questions: EvalQuestion[],
  current: { verifier: string; promptVersion: string },
) {
  const texts = await chunkTexts();
  const generationOf = new Map(generations.map((g) => [g.id, g]));
  const questionOf = new Map(questions.map((q) => [q.id, q.question]));

  const cases: SampleCase[] = pickSample(checks).map((check) => {
    const generation = generationOf.get(check.id)!;
    const numbers = [...new Set(check.claims.flatMap((c) => c.citations))]
      .filter((n) => n >= 1 && n <= generation.sources.length)
      .sort((a, b) => a - b);
    return {
      check,
      question: questionOf.get(check.id) ?? check.id,
      sources: numbers.map((n) => {
        const key = keyOf(generation.sources[n - 1]);
        const text = texts.get(key);
        if (text === undefined)
          throw new Error(`trecho ${key} não está no banco`);
        return { n, key, text };
      }),
    };
  });

  await mkdir(dirname(SAMPLE_FILE), { recursive: true });
  await writeFile(SAMPLE_FILE, formatSample(cases, current));
  process.stdout.write(
    `Amostra de ${cases.length} respostas gravada em ${SAMPLE_FILE}. Marque antes de olhar os veredictos, que ficam no fim do arquivo.\n`,
  );
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const sampleOnly = rawArgs.includes("--sample");
  const args = parseGenerationArgs(
    rawArgs.filter((arg) => arg !== "--sample"),
    DEFAULTS,
  );
  if (args.only.length > 0 && !sampleOnly) {
    throw new Error("--only vale só com --sample");
  }
  if (args.promptVersion && !args.reportOnly && !sampleOnly) {
    throw new Error("--prompt-version vale só com --report ou --sample");
  }
  const questions = parseQuestions(await readFile(QUESTIONS_FILE, "utf8"));
  const current = {
    verifier: env.FIDELITY_MODEL,
    promptVersion: FIDELITY_PROMPT_VERSION,
  };
  const generations = [
    ...latestResults(await readResults(GENERATION_FILE), {
      model: env.GENERATION_MODEL,
      promptVersion: args.promptVersion ?? PROMPT_VERSION,
    }).values(),
  ];

  if (!args.reportOnly && !sampleOnly) {
    await evaluate(generations, current, args);
  }

  const answered = generations.filter((generation) => !generation.notFound);
  const checks = currentChecks(
    answered,
    await readFidelityResults(FIDELITY_FILE),
    current,
  );

  if (sampleOnly) {
    const scoped =
      args.only.length > 0
        ? checks.filter((check) => args.only.includes(check.id))
        : checks;
    await writeSample(scoped, generations, questions, current);
    return;
  }
  const checkedIds = new Set(checks.map((check) => check.id));
  const missing = answered
    .map((generation) => generation.id)
    .filter((id) => !checkedIds.has(id))
    .sort();
  process.stdout.write(`\n${formatFidelityReport(checks, missing, current)}`);
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
