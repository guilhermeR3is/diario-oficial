import { env } from "@/env";
import { db } from "@/lib/db";
import { buildHealthReport } from "@/lib/health";
import pkg from "../../../package.json";

export const dynamic = "force-dynamic";

export async function GET() {
  const report = await buildHealthReport(db, {
    version: pkg.version,
    commit: env.VERCEL_GIT_COMMIT_SHA ?? "unknown",
    liveMode: env.LIVE_MODE === "on",
  });

  return Response.json(report, { status: report.status === "ok" ? 200 : 503 });
}
