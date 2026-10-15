import { describe, expect, it, vi } from "vitest";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "@/embedding/model";
import type { SearchHit } from "@/search/search-hit";
import { NOT_FOUND_ANSWER, PROMPT_VERSION } from "./build-prompt";
import { createFakeAnswerModel } from "./fake-answer-model";
import {
  type AskDependencies,
  type AskEvent,
  type AskOutcome,
  SOURCE_COUNT,
  handleAskRequest,
} from "./handle-ask";
import type { QueryRecord } from "./query-log";

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
    recordQuery: vi.fn<(record: QueryRecord) => Promise<string>>(
      async () => QUERY_ID,
    ),
    // cada leitura do relógio avança 250 ms, para a latência ser conhecida
    now: () => (clock += 250),
    ...overrides,
  };
}

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
    expect(off.recordQuery).not.toHaveBeenCalled();
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
    });
    expect(broken.recordQuery).not.toHaveBeenCalled();
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
