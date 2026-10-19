import type { PrismaClient } from "../../generated/prisma/client";
import type { GenerationFailure } from "./generate-answer";
import type { SearchMode } from "./handle-ask";

export type QueryRecord = {
  question: string;
  searchMode: SearchMode;
  retrievedChunkIds: number[];
  answer: string;
  model: string;
  promptVersion: string;
  latencyMs: number;
  totalTokens: number | null;
  visitorHash: string | null;
};

export async function recordQuery(
  db: PrismaClient,
  record: QueryRecord,
): Promise<string> {
  const row = await db.queryLog.create({ data: record, select: { id: true } });
  return row.id;
}

export type FailureRecord = {
  stage: "search" | "generation";
  reason: GenerationFailure;
  detail: string;
  searchMode: SearchMode;
  visitorHash: string | null;
};

export async function recordAskFailure(
  db: PrismaClient,
  record: FailureRecord,
): Promise<void> {
  await db.askFailure.create({ data: record });
}

// devolve false quando o id não existe, para a rota responder 404
export async function recordFeedback(
  db: PrismaClient,
  queryId: string,
  useful: boolean,
): Promise<boolean> {
  const { count } = await db.queryLog.updateMany({
    where: { id: queryId },
    data: { feedback: useful ? "useful" : "not_useful" },
  });
  return count === 1;
}
