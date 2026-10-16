import { env } from "@/env";
import { toEventStream } from "@/generation/event-stream";
import { createGroqAnswerModel } from "@/generation/groq-answer-model";
import { SOURCE_COUNT, handleAskRequest } from "@/generation/handle-ask";
import { recordQuery } from "@/generation/query-log";
import { closeLiveDay, liveDay, reserveLiveSlot } from "@/limits/live-limits";
import { hashVisitor, visitorIp } from "@/limits/visitor";
import { db } from "@/lib/db";
import { searchHybrid } from "@/search/search-hybrid";
import { searchText } from "@/search/search-text";

export const dynamic = "force-dynamic";

// o env.ts já exige a chave e o segredo quando LIVE_MODE=on
const model =
  env.LIVE_MODE === "on" && env.GROQ_API_KEY
    ? createGroqAnswerModel({
        apiKey: env.GROQ_API_KEY,
        model: env.GENERATION_MODEL,
        maxRetries: 0,
      })
    : null;

const limits = { site: env.LIVE_DAILY_LIMIT, visitor: env.VISITOR_DAILY_LIMIT };

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "body must be valid JSON" }, { status: 400 });
  }

  const day = liveDay(new Date());
  const visitorHash = hashVisitor(
    visitorIp(request.headers),
    day,
    env.VISITOR_HASH_SECRET ?? "",
  );

  const outcome = await handleAskRequest(
    {
      model,
      searchHybrid: (query) => searchHybrid(db, query, SOURCE_COUNT),
      searchText: (question) => searchText(db, question, SOURCE_COUNT),
      reserveSlot: () => reserveLiveSlot(db, { day, visitorHash, limits }),
      closeDay: () => closeLiveDay(db, { day, siteLimit: limits.site }),
      recordQuery: (record) => recordQuery(db, { ...record, visitorHash }),
      now: () => performance.now(),
    },
    payload,
  );
  if (outcome.status !== 200) {
    return Response.json(outcome.body, { status: outcome.status });
  }

  return new Response(toEventStream(outcome.events), {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
