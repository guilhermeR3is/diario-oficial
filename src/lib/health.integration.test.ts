import { execFileSync } from "node:child_process";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "./db";
import { buildHealthReport } from "./health";

const meta = { version: "0.0.0-test", commit: "abc123", liveMode: false };

describe("buildHealthReport", () => {
  let container: StartedPostgreSqlContainer;
  let db: ReturnType<typeof createDb>;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("pgvector/pgvector:pg17").start();
    const url = container.getConnectionUri();

    // dotenv não sobrescreve variáveis já definidas, então o prisma.config.ts usa esta URL
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      env: { ...process.env, DATABASE_URL: url },
      stdio: "pipe",
    });
    db = createDb(url);
  }, 180_000);

  afterAll(async () => {
    await db?.$disconnect();
    await container?.stop();
  });

  it("reports ok when the database answers and pgvector is installed", async () => {
    const report = await buildHealthReport(db, meta);

    expect(report).toEqual({
      status: "ok",
      ...meta,
      checks: { database: "ok", vector: "ok" },
    });
  });

  it("reports degraded when the vector extension is missing", async () => {
    await db.$executeRawUnsafe("DROP EXTENSION vector");

    try {
      const report = await buildHealthReport(db, meta);

      expect(report.status).toBe("degraded");
      expect(report.checks).toEqual({ database: "ok", vector: "error" });
    } finally {
      await db.$executeRawUnsafe("CREATE EXTENSION vector");
    }
  });

  it("reports degraded and skips the vector check when the database is unreachable", async () => {
    const unreachable = createDb("postgresql://localhost:1/none");

    try {
      const report = await buildHealthReport(unreachable, meta);

      expect(report.status).toBe("degraded");
      expect(report.checks).toEqual({ database: "error", vector: "skipped" });
    } finally {
      await unreachable.$disconnect();
    }
  });
});
