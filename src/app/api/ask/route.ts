import { env } from "@/env";
import { toEventStream } from "@/generation/event-stream";
import { createGroqAnswerModel } from "@/generation/groq-answer-model";
import { SOURCE_COUNT, handleAskRequest } from "@/generation/handle-ask";
import { db } from "@/lib/db";
import { searchHybrid } from "@/search/search-hybrid";

export const dynamic = "force-dynamic";

// o env.ts já exige a chave quando LIVE_MODE=on
const model =
  env.LIVE_MODE === "on" && env.GROQ_API_KEY
    ? createGroqAnswerModel({
        apiKey: env.GROQ_API_KEY,
        model: env.GENERATION_MODEL,
      })
    : null;

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "body must be valid JSON" }, { status: 400 });
  }

  const outcome = await handleAskRequest(
    { model, search: (query) => searchHybrid(db, query, SOURCE_COUNT) },
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
