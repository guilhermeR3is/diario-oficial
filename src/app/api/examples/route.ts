import { listExamples } from "@/examples/cached-answers";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await listExamples(db));
  } catch (error) {
    logger.error({ err: error }, "examples failed to load");
    return Response.json({ error: "examples failed to load" }, { status: 500 });
  }
}
