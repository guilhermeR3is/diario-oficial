import "dotenv/config";
import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { env } from "@/env";
import { assertAllChunksHaveTheModelVector } from "@/eval/assert-chunk-vectors";
import { listExamples, loadExample } from "@/examples/cached-answers";
import { createDb, db } from "@/lib/db";
import { copyDemoData, DEMO_TABLES } from "./copy-demo-data";

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

// só host, porta e banco: a URL inteira traz a senha, que não pode aparecer no terminal
function databaseOf(url: string): string {
  const parsed = new URL(url);
  return `${parsed.hostname.toLowerCase()}:${parsed.port || "5432"}${parsed.pathname}`;
}

async function main() {
  const unknown = process.argv.slice(2).filter((arg) => arg !== "--yes");
  if (unknown.length > 0) throw new Error(`Opção desconhecida: ${unknown[0]}`);
  const yes = process.argv.includes("--yes");

  const targetUrl = env.DEMO_DATABASE_URL;
  if (!targetUrl) {
    throw new Error(
      "DEMO_DATABASE_URL ausente no .env: cole a conexão direta (sem -pooler) do banco publicado",
    );
  }
  const source = databaseOf(env.DATABASE_URL);
  const target = databaseOf(targetUrl);
  if (source === target) {
    throw new Error(
      "DEMO_DATABASE_URL aponta para o mesmo banco que DATABASE_URL",
    );
  }

  await assertAllChunksHaveTheModelVector(db);
  const examples = await db.cachedAnswer.count();
  if (examples === 0) {
    throw new Error(
      "o banco local não tem respostas de exemplo: rode pnpm examples:generate antes",
    );
  }

  process.stdout.write(
    [
      `Origem: ${source}`,
      `Destino: ${target}`,
      `Vou aplicar as migrations no destino, apagar e copiar ${DEMO_TABLES.join(", ")} (com ${examples} exemplos), conferir e rodar ANALYZE.`,
      "query_log e live_usage do destino não são tocados. Nenhuma chamada à Groq.",
      "",
    ].join("\n"),
  );
  if (!yes && !(await confirm("Continuar?"))) {
    process.stdout.write("Cancelado, nada foi alterado.\n");
    return;
  }

  const started = performance.now();
  // dotenv não sobrescreve variáveis já definidas, então o prisma.config.ts usa o destino
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: targetUrl },
    stdio: "inherit",
  });

  const demo = createDb(targetUrl);
  try {
    const copies = await copyDemoData(db, demo, (table, copied, total) =>
      process.stdout.write(`${table}: ${copied} de ${total}\n`),
    );
    await demo.$executeRawUnsafe(`ANALYZE ${DEMO_TABLES.join(", ")}`);

    for (const example of await listExamples(demo)) {
      await loadExample(demo, example.slug);
    }
    const [size] = await demo.$queryRaw<{ size: string }[]>`
      SELECT pg_size_pretty(pg_database_size(current_database())) AS size`;
    const seconds = Math.round((performance.now() - started) / 1000);
    process.stdout.write(
      [
        `Copiado e conferido em ${seconds} s: ${copies.map((copy) => `${copy.table} ${copy.rows}`).join(", ")}.`,
        `Os ${examples} exemplos abrem no destino com os trechos citados. Tamanho do banco de destino: ${size!.size}.`,
        "",
      ].join("\n"),
    );
  } finally {
    await demo.$disconnect();
  }
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
