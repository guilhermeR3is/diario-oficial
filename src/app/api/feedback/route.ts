import { handleFeedbackRequest } from "@/generation/handle-feedback";
import { recordFeedback } from "@/generation/query-log";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "body must be valid JSON" }, { status: 400 });
  }

  const outcome = await handleFeedbackRequest(
    (queryId, useful) => recordFeedback(db, queryId, useful),
    payload,
  );
  return outcome.status === 204
    ? new Response(null, { status: 204 })
    : Response.json(outcome.body, { status: outcome.status });
}
