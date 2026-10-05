import { logger } from "@/lib/logger";
import type { PrismaClient } from "../../generated/prisma/client";

type CheckResult = "ok" | "error" | "skipped";

export type HealthReport = {
  status: "ok" | "degraded";
  version: string;
  commit: string;
  liveMode: boolean;
  checks: { database: CheckResult; vector: CheckResult };
};

type HealthMeta = Pick<HealthReport, "version" | "commit" | "liveMode">;

async function checkDatabase(db: PrismaClient): Promise<CheckResult> {
  try {
    await db.$queryRaw`SELECT 1`;
    return "ok";
  } catch (error) {
    logger.error({ err: error }, "health check: database unreachable");
    return "error";
  }
}

async function checkVector(db: PrismaClient): Promise<CheckResult> {
  try {
    const rows = await db.$queryRaw<
      unknown[]
    >`SELECT 1 FROM pg_extension WHERE extname = 'vector'`;
    return rows.length > 0 ? "ok" : "error";
  } catch (error) {
    logger.error({ err: error }, "health check: vector lookup failed");
    return "error";
  }
}

export async function buildHealthReport(
  db: PrismaClient,
  meta: HealthMeta,
): Promise<HealthReport> {
  const database = await checkDatabase(db);
  const vector = database === "ok" ? await checkVector(db) : "skipped";
  const status = database === "ok" && vector === "ok" ? "ok" : "degraded";

  return { status, ...meta, checks: { database, vector } };
}
