import { describe, expect, it, vi } from "vitest";
import { handleFeedbackRequest } from "./handle-feedback";

const QUERY_ID = "0b6f3a52-6a51-4c43-9d1e-5f4f0c3b7a10";

describe("handleFeedbackRequest", () => {
  it.each([true, false])(
    "records useful=%s and answers 204",
    async (useful) => {
      const record = vi.fn(async () => true);

      const outcome = await handleFeedbackRequest(record, {
        queryId: QUERY_ID,
        useful,
      });

      expect(outcome).toEqual({ status: 204 });
      expect(record).toHaveBeenCalledWith(QUERY_ID, useful);
    },
  );

  it("answers 404 when the query does not exist", async () => {
    const outcome = await handleFeedbackRequest(async () => false, {
      queryId: QUERY_ID,
      useful: true,
    });

    expect(outcome).toEqual({
      status: 404,
      body: { error: "query not found" },
    });
  });

  it.each([
    ["an id that is not a uuid", { queryId: "12", useful: true }],
    ["a missing verdict", { queryId: QUERY_ID }],
    ["a verdict that is not a boolean", { queryId: QUERY_ID, useful: "sim" }],
    ["an unknown field", { queryId: QUERY_ID, useful: true, note: "x" }],
    ["a body that is not an object", "útil"],
  ])(
    "answers 400 for %s, without touching the database",
    async (_, payload) => {
      const record = vi.fn(async () => true);

      const outcome = await handleFeedbackRequest(record, payload);

      expect(outcome.status).toBe(400);
      expect(record).not.toHaveBeenCalled();
    },
  );

  it("answers 500 without leaking the error when the database fails", async () => {
    const outcome = await handleFeedbackRequest(
      async () => {
        throw new Error("conexão recusada em 10.0.0.7");
      },
      { queryId: QUERY_ID, useful: true },
    );

    expect(outcome).toEqual({
      status: 500,
      body: { error: "feedback failed" },
    });
  });
});
