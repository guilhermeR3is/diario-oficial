import { describe, expect, it, vi } from "vitest";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "@/embedding/model";
import type { SlotOutcome } from "@/limits/live-limits";
import type { SearchHit } from "@/search/search-hit";
import { type AnswerModel, ModelRateLimitError } from "./answer-model";
import { NOT_FOUND_ANSWER, PROMPT_VERSION } from "./build-prompt";
import { createFakeAnswerModel } from "./fake-answer-model";
import {
  type AskDependencies,
  type AskFailure,
  type AskRecord,
  type AskEvent,
  type AskOutcome,
  SOURCE_COUNT,
  handleAskRequest,
} from "./handle-ask";

const QUERY_ID = "0b6f3a52-6a51-4c43-9d1e-5f4f0c3b7a10";

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

// a busca que não deveria ser usada falha alto, em vez de devolver algo plausível
const unusedSearch = () =>
  vi.fn(async (): Promise<SearchHit[]> => {
    throw new Error("busca errada");
  });

const failing = (message: string) =>
  vi.fn(async (): Promise<never> => {
    throw new Error(message);
  });

function deps(overrides: Partial<AskDependencies> = {}) {
  let clock = 1_000;
  return {
    model: createFakeAnswerModel("O decreto saiu [1]."),
    searchHybrid: searchReturning([hit(1)]),
    searchText: unusedSearch(),
    reserveSlot: vi.fn(async (): Promise<SlotOutcome> => "granted"),
    closeDay: vi.fn(async () => {}),
    recordQuery: vi.fn<(record: AskRecord) => Promise<string>>(
      async () => QUERY_ID,
    ),
    recordFailure: vi.fn<(failure: AskFailure) => Promise<void>>(
      async () => {},
    ),
    // cada leitura do relógio avança 250 ms, para a latência ser conhecida
    now: () => (clock += 250),
    ...overrides,
  };
}

const rateLimited = (window: "minute" | "day"): AnswerModel => ({
  name: "limitado",
  async *stream() {
    throw new ModelRateLimitError(window);
  },
});

async function eventsOf(outcome: AskOutcome) {
  if (outcome.status !== 200) throw new Error(`status ${outcome.status}`);
  const events: AskEvent[] = [];
  for await (const event of outcome.events) events.push(event);
  return events;
}

describe("handleAskRequest", () => {
  it("sends the six best sources to the model, as the plan says", () => {
    expect(SOURCE_COUNT).toBe(6);
  });

  it("answers 503 and touches neither the searches nor the log when live answers are off", async () => {
    const off = deps({ model: null });

    const outcome = await handleAskRequest(off, validPayload());

    expect(outcome).toEqual({
      status: 503,
      body: { error: "live answers are turned off" },
    });
    expect(off.searchHybrid).not.toHaveBeenCalled();
    expect(off.reserveSlot).not.toHaveBeenCalled();
    expect(off.recordQuery).not.toHaveBeenCalled();
  });

  it("spends one of the visitor's questions before searching", async () => {
    const order: string[] = [];
    const tracked = deps({
      reserveSlot: vi.fn(async (): Promise<SlotOutcome> => {
        order.push("reserve");
        return "granted";
      }),
      searchHybrid: vi.fn(async () => {
        order.push("search");
        return [hit(1)];
      }),
    });

    await eventsOf(await handleAskRequest(tracked, validPayload()));

    expect(order).toEqual(["reserve", "search"]);
    expect(tracked.reserveSlot).toHaveBeenCalledOnce();
  });

  it("answers 429 without searching or calling the model when the visitor used up the day", async () => {
    const model = createFakeAnswerModel("não deveria falar [1]");
    const limited = deps({
      model,
      reserveSlot: vi.fn(async (): Promise<SlotOutcome> => "visitor-limit"),
    });

    const outcome = await handleAskRequest(limited, validPayload());

    expect(outcome).toEqual({
      status: 429,
      body: { error: "visitor daily limit reached" },
    });
    expect(limited.searchHybrid).not.toHaveBeenCalled();
    expect(model.prompts).toEqual([]);
  });

  it("answers 503, as when live answers are off, once the site used up the day", async () => {
    const limited = deps({
      reserveSlot: vi.fn(async (): Promise<SlotOutcome> => "site-limit"),
    });

    const outcome = await handleAskRequest(limited, validPayload());

    expect(outcome).toEqual({
      status: 503,
      body: { error: "site daily limit reached" },
    });
    expect(limited.searchHybrid).not.toHaveBeenCalled();
  });

  it("answers 500 and does not search when the limit cannot be checked", async () => {
    const broken = deps({ reserveSlot: failing("banco fora do ar") });

    const outcome = await handleAskRequest(broken, validPayload());

    expect(outcome).toEqual({
      status: 500,
      body: { error: "could not check the daily limit" },
    });
    expect(broken.searchHybrid).not.toHaveBeenCalled();
  });

  it("does not spend a question on a request it refuses as invalid", async () => {
    const invalid = deps();

    await handleAskRequest(invalid, validPayload({ question: "" }));

    expect(invalid.reserveSlot).not.toHaveBeenCalled();
  });

  it("closes the day for the next visitors when the model's daily quota runs out", async () => {
    const exhausted = deps({ model: rateLimited("day") });

    const events = await eventsOf(
      await handleAskRequest(exhausted, validPayload()),
    );

    expect(events.at(-1)).toMatchObject({ type: "error", reason: "quota" });
    expect(exhausted.closeDay).toHaveBeenCalledOnce();
    expect(exhausted.recordQuery).not.toHaveBeenCalled();
  });

  it("keeps the day open when the model is only busy for a minute", async () => {
    const busy = deps({ model: rateLimited("minute") });

    const events = await eventsOf(await handleAskRequest(busy, validPayload()));

    expect(events.at(-1)).toMatchObject({ type: "error", reason: "busy" });
    expect(busy.closeDay).not.toHaveBeenCalled();
  });

  it("still tells the visitor about the quota when closing the day fails", async () => {
    const exhausted = deps({
      model: rateLimited("day"),
      closeDay: failing("banco fora do ar"),
    });

    const events = await eventsOf(
      await handleAskRequest(exhausted, validPayload()),
    );

    expect(events.at(-1)).toMatchObject({ type: "error", reason: "quota" });
  });

  it("answers 200 with the sources, the search used, the text and the done event", async () => {
    const hits = [hit(1), hit(2)];

    const events = await eventsOf(
      await handleAskRequest(
        deps({ searchHybrid: searchReturning(hits) }),
        validPayload(),
      ),
    );

    expect(events[0]).toEqual({
      type: "sources",
      sources: hits,
      searchMode: "hybrid",
    });
    expect(events.at(-1)).toMatchObject({
      type: "done",
      answer: "O decreto saiu [1].",
      citations: [1],
      queryId: QUERY_ID,
    });
  });

  it("searches with the trimmed question and the vector it received", async () => {
    const hybrid = deps();

    await handleAskRequest(
      hybrid,
      validPayload({ question: "  Quem foi nomeado?\n" }),
    );

    expect(hybrid.searchHybrid).toHaveBeenCalledWith({
      question: "Quem foi nomeado?",
      vector: unitVector(),
    });
  });

  it("falls back to the text search, and says so, when the request has no vector", async () => {
    const hits = [hit(3)];
    const textOnly = deps({
      searchHybrid: unusedSearch(),
      searchText: searchReturning(hits),
    });

    const events = await eventsOf(
      await handleAskRequest(textOnly, {
        question: "  Quem foi nomeado?\n",
      }),
    );

    expect(textOnly.searchText).toHaveBeenCalledWith("Quem foi nomeado?");
    expect(textOnly.searchHybrid).not.toHaveBeenCalled();
    expect(events[0]).toEqual({
      type: "sources",
      sources: hits,
      searchMode: "text",
    });
    expect(events.at(-1)).toMatchObject({ type: "done", citations: [1] });
  });

  it("records the answered question with the chunks it saw and the time it took", async () => {
    const recorded = deps({
      model: createFakeAnswerModel("O decreto saiu [1].", 7, 5_120),
      searchText: searchReturning([hit(7), hit(9)]),
      searchHybrid: unusedSearch(),
    });

    await eventsOf(
      await handleAskRequest(recorded, { question: "Quem foi nomeado?" }),
    );

    expect(recorded.recordQuery).toHaveBeenCalledOnce();
    expect(recorded.recordQuery).toHaveBeenCalledWith({
      question: "Quem foi nomeado?",
      searchMode: "text",
      retrievedChunkIds: [7, 9],
      answer: "O decreto saiu [1].",
      model: "fake",
      promptVersion: PROMPT_VERSION,
      latencyMs: 250,
      totalTokens: 5_120,
    });
  });

  it("still delivers the answer, without a query id, when recording it fails", async () => {
    const events = await eventsOf(
      await handleAskRequest(
        deps({ recordQuery: failing("banco fora do ar") }),
        validPayload(),
      ),
    );

    expect(events.at(-1)).toMatchObject({
      type: "done",
      answer: "O decreto saiu [1].",
      queryId: null,
    });
  });

  it("records nothing when the generation fails", async () => {
    const broken = deps({
      model: {
        name: "quebrado",
        async *stream() {
          throw new Error("cota esgotada");
        },
      },
    });

    const events = await eventsOf(
      await handleAskRequest(broken, validPayload()),
    );

    expect(events.at(-1)).toEqual({
      type: "error",
      message: "generation failed",
      reason: "failed",
    });
    expect(broken.recordQuery).not.toHaveBeenCalled();
    expect(broken.closeDay).not.toHaveBeenCalled();
  });

  it("records a generation failure with its detail and sends the visitor only the reason", async () => {
    const broken = deps({
      model: {
        name: "quebrado",
        async *stream() {
          throw new Error("503 over capacity in org_interno");
        },
      },
    });

    const events = await eventsOf(
      await handleAskRequest(broken, validPayload()),
    );

    expect(broken.recordFailure).toHaveBeenCalledExactlyOnceWith({
      stage: "generation",
      reason: "failed",
      detail: "503 over capacity in org_interno",
      searchMode: "hybrid",
    });
    expect(events.at(-1)).toEqual({
      type: "error",
      message: "generation failed",
      reason: "failed",
    });
    expect(JSON.stringify(events)).not.toContain("org_interno");
  });

  it("records the daily quota with the provider's message and still closes the day", async () => {
    const exhausted = deps({
      model: {
        name: "limitado",
        async *stream() {
          throw new ModelRateLimitError("day", {
            cause: new Error("tokens per day in org_interno"),
          });
        },
      },
    });

    const events = await eventsOf(
      await handleAskRequest(exhausted, validPayload()),
    );

    expect(exhausted.closeDay).toHaveBeenCalledOnce();
    expect(exhausted.recordFailure).toHaveBeenCalledExactlyOnceWith({
      stage: "generation",
      reason: "quota",
      detail: "model rate limit reached (day): tokens per day in org_interno",
      searchMode: "hybrid",
    });
    expect(JSON.stringify(events)).not.toContain("org_interno");
  });

  it("records a search failure before answering 500", async () => {
    const broken = deps({
      searchHybrid: failing("conexão com o banco caiu"),
    });

    const outcome = await handleAskRequest(broken, validPayload());

    expect(outcome.status).toBe(500);
    expect(broken.recordFailure).toHaveBeenCalledExactlyOnceWith({
      stage: "search",
      reason: "failed",
      detail: "conexão com o banco caiu",
      searchMode: "hybrid",
    });
  });

  it("still tells the visitor about the failure when recording it fails", async () => {
    const broken = deps({
      model: rateLimited("minute"),
      recordFailure: failing("banco fora do ar"),
    });

    const events = await eventsOf(
      await handleAskRequest(broken, validPayload()),
    );

    expect(events.at(-1)).toEqual({
      type: "error",
      message: "model rate limit reached",
      reason: "busy",
    });
  });

  it("records no failure when the answer comes out", async () => {
    const working = deps();

    await eventsOf(await handleAskRequest(working, validPayload()));

    expect(working.recordFailure).not.toHaveBeenCalled();
  });

  it("answers not found without calling the model when the search finds nothing", async () => {
    const model = createFakeAnswerModel("não deveria falar [1]");

    const events = await eventsOf(
      await handleAskRequest(
        deps({ model, searchHybrid: searchReturning([]) }),
        validPayload(),
      ),
    );

    expect(model.prompts).toEqual([]);
    expect(events.at(-1)).toMatchObject({
      type: "done",
      answer: NOT_FOUND_ANSWER,
      notFound: true,
    });
  });

  it("accepts a question of exactly 500 characters", async () => {
    const outcome = await handleAskRequest(
      deps(),
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
    const invalid = deps();

    const outcome = await handleAskRequest(invalid, validPayload({ question }));

    expect(outcome.status).toBe(400);
    expect(JSON.stringify(outcome)).toContain("question");
    expect(invalid.searchHybrid).not.toHaveBeenCalled();
  });

  it("refuses a vector from another model or of the wrong size, as the search endpoint does", async () => {
    const invalid = deps({ searchText: searchReturning([hit(1)]) });

    const otherModel = await handleAskRequest(
      invalid,
      validPayload({ model: "outro" }),
    );
    const shortVector = await handleAskRequest(
      invalid,
      validPayload({ vector: [1, 2] }),
    );

    expect(otherModel.status).toBe(400);
    expect(shortVector.status).toBe(400);
    expect(invalid.searchHybrid).not.toHaveBeenCalled();
    expect(invalid.searchText).not.toHaveBeenCalled();
  });

  it.each([
    ["a model name without a vector", { model: EMBEDDING_MODEL }],
    ["a vector without the model name", { vector: unitVector() }],
  ])("answers 400 for %s", async (_, partial) => {
    const invalid = deps({ searchText: searchReturning([hit(1)]) });

    const outcome = await handleAskRequest(invalid, {
      question: "Quem foi nomeado?",
      ...partial,
    });

    expect(outcome.status).toBe(400);
    expect(JSON.stringify(outcome)).toContain("together");
    expect(invalid.searchHybrid).not.toHaveBeenCalled();
    expect(invalid.searchText).not.toHaveBeenCalled();
  });

  it.each([null, "texto", [], 7])(
    "answers 400 for a body that is not an object (%j)",
    async (payload) => {
      const outcome = await handleAskRequest(deps(), payload);

      expect(outcome.status).toBe(400);
    },
  );

  it.each([
    ["hybrid", validPayload(), "searchHybrid"],
    ["text", { question: "Quem foi nomeado?" }, "searchText"],
  ] as const)(
    "answers 500 without leaking the error, and never calls the model, when the %s search fails",
    async (_, payload, which) => {
      const model = createFakeAnswerModel("ok [1]");
      const broken = deps({
        model,
        [which]: failing("conexão recusada em 10.0.0.7"),
      });

      const outcome = await handleAskRequest(broken, payload);

      expect(outcome).toEqual({
        status: 500,
        body: { error: "search failed" },
      });
      expect(model.prompts).toEqual([]);
      expect(broken.recordQuery).not.toHaveBeenCalled();
    },
  );
});
