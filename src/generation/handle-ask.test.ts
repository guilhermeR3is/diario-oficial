import { describe, expect, it, vi } from "vitest";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "@/embedding/model";
import type { SearchHit } from "@/search/search-hit";
import { NOT_FOUND_ANSWER } from "./build-prompt";
import { createFakeAnswerModel } from "./fake-answer-model";
import type { AnswerEvent } from "./generate-answer";
import { type AskOutcome, SOURCE_COUNT, handleAskRequest } from "./handle-ask";

const unitVector = () =>
  Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i === 0 ? 1 : 0));

const hit = (id: number): SearchHit => ({
  chunkId: id,
  ordinal: id + 100,
  score: 0.5,
  actType: "PORTARIA",
  title: `PORTARIA Nº ${id}/2026`,
  secretariat: "SEMAD",
  date: "2026-09-02",
  page: 12,
  pageEnd: 12,
  text: `texto do ato ${id}`,
  edition: { id: 1, title: "Edição", sourceUrl: "https://exemplo.test/1.pdf" },
});

const validPayload = (overrides: Record<string, unknown> = {}) => ({
  model: EMBEDDING_MODEL,
  vector: unitVector(),
  question: "Quem foi nomeado?",
  ...overrides,
});

const searchReturning = (hits: SearchHit[]) => vi.fn(async () => hits);

async function eventsOf(outcome: AskOutcome) {
  if (outcome.status !== 200) throw new Error(`status ${outcome.status}`);
  const events: AnswerEvent[] = [];
  for await (const event of outcome.events) events.push(event);
  return events;
}

describe("handleAskRequest", () => {
  it("sends the six best sources to the model, as the plan says", () => {
    expect(SOURCE_COUNT).toBe(6);
  });

  it("answers 503 and touches neither the search nor a model when live answers are off", async () => {
    const search = searchReturning([hit(1)]);

    const outcome = await handleAskRequest(
      { model: null, search },
      validPayload(),
    );

    expect(outcome).toEqual({
      status: 503,
      body: { error: "live answers are turned off" },
    });
    expect(search).not.toHaveBeenCalled();
  });

  it("answers 200 with the sources, the text and the done event", async () => {
    const model = createFakeAnswerModel("O decreto saiu [1].");
    const hits = [hit(1), hit(2)];

    const outcome = await handleAskRequest(
      { model, search: searchReturning(hits) },
      validPayload(),
    );
    const events = await eventsOf(outcome);

    expect(events[0]).toEqual({ type: "sources", sources: hits });
    expect(events.at(-1)).toMatchObject({
      type: "done",
      answer: "O decreto saiu [1].",
      citations: [1],
    });
  });

  it("searches with the trimmed question and the vector it received", async () => {
    const search = searchReturning([hit(1)]);

    await handleAskRequest(
      { model: createFakeAnswerModel("ok [1]"), search },
      validPayload({ question: "  Quem foi nomeado?\n" }),
    );

    expect(search).toHaveBeenCalledWith({
      question: "Quem foi nomeado?",
      vector: unitVector(),
    });
  });

  it("answers not found without calling the model when the search finds nothing", async () => {
    const model = createFakeAnswerModel("não deveria falar [1]");

    const outcome = await handleAskRequest(
      { model, search: searchReturning([]) },
      validPayload(),
    );
    const events = await eventsOf(outcome);

    expect(model.prompts).toEqual([]);
    expect(events.at(-1)).toMatchObject({
      type: "done",
      answer: NOT_FOUND_ANSWER,
      notFound: true,
    });
  });

  it("accepts a question of exactly 500 characters", async () => {
    const outcome = await handleAskRequest(
      {
        model: createFakeAnswerModel("ok [1]"),
        search: searchReturning([hit(1)]),
      },
      validPayload({ question: "a".repeat(500) }),
    );

    expect(outcome.status).toBe(200);
  });

  it.each([
    ["is missing", undefined],
    ["is empty", ""],
    ["is only spaces", "   \n"],
    ["is not text", 42],
    ["is longer than 500 characters", "a".repeat(501)],
  ])("answers 400 naming the question when it %s", async (_, question) => {
    const search = searchReturning([hit(1)]);

    const outcome = await handleAskRequest(
      { model: createFakeAnswerModel("ok"), search },
      validPayload({ question }),
    );

    expect(outcome.status).toBe(400);
    expect(JSON.stringify(outcome)).toContain("question");
    expect(search).not.toHaveBeenCalled();
  });

  it("refuses a vector from another model or of the wrong size, as the search endpoint does", async () => {
    const deps = {
      model: createFakeAnswerModel("ok"),
      search: searchReturning([hit(1)]),
    };

    const otherModel = await handleAskRequest(
      deps,
      validPayload({ model: "outro" }),
    );
    const shortVector = await handleAskRequest(
      deps,
      validPayload({ vector: [1, 2] }),
    );

    expect(otherModel.status).toBe(400);
    expect(shortVector.status).toBe(400);
    expect(deps.search).not.toHaveBeenCalled();
  });

  it.each([null, "texto", [], 7])(
    "answers 400 for a body that is not an object (%j)",
    async (payload) => {
      const outcome = await handleAskRequest(
        { model: createFakeAnswerModel("ok"), search: searchReturning([]) },
        payload,
      );

      expect(outcome.status).toBe(400);
    },
  );

  it("answers 500 without leaking the error, and never calls the model, when the search fails", async () => {
    const model = createFakeAnswerModel("ok [1]");
    const search = vi.fn(async () => {
      throw new Error("conexão recusada em 10.0.0.7");
    });

    const outcome = await handleAskRequest({ model, search }, validPayload());

    expect(outcome).toEqual({ status: 500, body: { error: "search failed" } });
    expect(model.prompts).toEqual([]);
  });
});
