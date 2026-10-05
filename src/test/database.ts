import { execFileSync } from "node:child_process";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { createDb } from "@/lib/db";

export async function startTestDatabase() {
  const container = await new PostgreSqlContainer(
    "pgvector/pgvector:pg17",
  ).start();
  const url = container.getConnectionUri();

  // dotenv não sobrescreve variáveis já definidas, então o prisma.config.ts usa esta URL
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
  const db = createDb(url);

  return {
    db,
    async stop() {
      await db.$disconnect();
      await container.stop();
    },
  };
}
