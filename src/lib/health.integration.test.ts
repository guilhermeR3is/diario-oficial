import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDatabase } from "@/test/database";
import { createDb } from "./db";
import { buildHealthReport } from "./health";

const meta = { version: "0.0.0-test", commit: "abc123", liveMode: false };

describe("buildHealthReport", () => {
  let testDb: Awaited<ReturnType<typeof startTestDatabase>>;
  let db: ReturnType<typeof createDb>;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    db = testDb.db;
  }, 180_000);

  afterAll(async () => {
    await testDb?.stop();
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
