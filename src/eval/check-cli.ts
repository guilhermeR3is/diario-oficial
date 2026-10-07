import "dotenv/config";
import { readFile } from "node:fs/promises";
import { db } from "@/lib/db";
import { checkQuestions } from "./check-questions";
import { loadChunkIndex } from "./chunk-index";
import { parseQuestions } from "./questions";

const QUESTIONS_FILE = "eval/questions.jsonl";

async function main() {
  const show = process.argv.includes("--show");
  const questions = parseQuestions(await readFile(QUESTIONS_FILE, "utf8"));
  const chunks = await loadChunkIndex(db);

  if (show) {
    const byKey = new Map(
      chunks.map((c) => [`${c.sourceUrl}#${c.ordinal}`, c]),
    );
    for (const q of questions) {
      process.stdout.write(`\n${q.id} [${q.kind}] ${q.question}\n`);
      for (const key of q.relevant) {
        const c = byKey.get(`${key.sourceUrl}#${key.ordinal}`);
        const where = c
          ? `${c.editionTitle.replace("Diário Oficial - ", "")}, p.${c.page}: ${c.title.slice(0, 70)}`
          : "(trecho não encontrado)";
        process.stdout.write(`    - ${where}\n`);
      }
      for (const term of q.absent)
        process.stdout.write(`    - sem "${term}" em nenhum trecho\n`);
    }
    process.stdout.write("\n");
  }

  const problems = checkQuestions(questions, chunks);
  const answerable = questions.filter((q) => q.kind !== "unanswerable").length;
  process.stdout.write(
    `${questions.length} perguntas (${answerable} com resposta, ${questions.length - answerable} sem), ${problems.length} problema(s)\n`,
  );
  for (const problem of problems) process.stdout.write(`  - ${problem}\n`);
  if (problems.length > 0) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
