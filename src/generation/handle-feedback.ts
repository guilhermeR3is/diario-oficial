import { z } from "zod";
import { logger } from "@/lib/logger";

const feedbackRequestSchema = z.strictObject({
  queryId: z.uuid(),
  useful: z.boolean(),
});

export type FeedbackOutcome =
  { status: 204 } | { status: 400 | 404 | 500; body: { error: string } };

export async function handleFeedbackRequest(
  recordFeedback: (queryId: string, useful: boolean) => Promise<boolean>,
  payload: unknown,
): Promise<FeedbackOutcome> {
  const request = feedbackRequestSchema.safeParse(payload);
  if (!request.success) {
    return { status: 400, body: { error: z.prettifyError(request.error) } };
  }

  try {
    const found = await recordFeedback(
      request.data.queryId,
      request.data.useful,
    );
    return found
      ? { status: 204 }
      : { status: 404, body: { error: "query not found" } };
  } catch (error) {
    logger.error({ err: error }, "feedback failed");
    return { status: 500, body: { error: "feedback failed" } };
  }
}
