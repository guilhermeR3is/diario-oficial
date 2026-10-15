import { describe, expect, it } from "vitest";
import type { ExampleAnswer } from "@/examples/cached-answers";
import type { SearchHit } from "@/search/search-hit";
import {
  type AskAction,
  type AskState,
  askReducer,
  failureForStatus,
  initialAskState,
} from "./ask-state";

const source = (id: number): SearchHit => ({
  chunkId: id,
  ordinal: id,
  score: 0.5,
  actType: "PORTARIA",
  title: `PORTARIA Nº ${id}/2026`,
  secretariat: "SEMAD",
  date: "2026-09-02",
  page: 12,
  pageEnd: 13,
  text: `texto ${id}`,
  edition: { id: 1, title: "Edição", sourceUrl: "https://exemplo.test/1.pdf" },
});

const run = (actions: AskAction[], from: AskState = initialAskState) =>
  actions.reduce(askReducer, from);

const live = (requestId = 1): AskAction[] => [
  { type: "live-requested", requestId, question: "Quem foi nomeado?" },
  { type: "search-started", requestId, searchMode: "hybrid", at: 1_000 },
];

const sourcesEvent = (
  requestId = 1,
  searchMode: "hybrid" | "text" = "hybrid",
): AskAction => ({
  type: "event",
  requestId,
  at: 1_400,
  event: { type: "sources", sources: [source(1), source(2)], searchMode },
});

const done = (requestId = 1): AskAction => ({
  type: "event",
  requestId,
  at: 4_250,
  event: {
    type: "done",
    answer: "Fulana [1].",
    notFound: false,
    citations: [1],
    invalidCitations: [],
    model: "fake",
    promptVersion: "v2",
    queryId: "id-do-registro",
  },
});

describe("askReducer", () => {
  it("walks a live question from preparing to answered, keeping the sources and the time taken", () => {
    const state = run([
      ...live(),
      sourcesEvent(),
      {
        type: "event",
        requestId: 1,
        at: 2_000,
        event: { type: "delta", text: "Fula" },
      },
      {
        type: "event",
        requestId: 1,
        at: 2_100,
        event: { type: "delta", text: "na [1]." },
      },
      done(),
    ]);

    expect(state).toEqual({
      phase: "answered",
      requestId: 1,
      question: "Quem foi nomeado?",
      answer: "Fulana [1].",
      citations: [1],
      notFound: false,
      sources: [source(1), source(2)],
      origin: {
        kind: "live",
        searchMode: "hybrid",
        queryId: "id-do-registro",
        durationMs: 3_250,
      },
    });
  });

  it("accumulates the streamed text while writing", () => {
    const state = run([
      ...live(),
      sourcesEvent(),
      {
        type: "event",
        requestId: 1,
        at: 2_000,
        event: { type: "delta", text: "Fula" },
      },
      {
        type: "event",
        requestId: 1,
        at: 2_100,
        event: { type: "delta", text: "na" },
      },
    ]);

    expect(state).toMatchObject({ phase: "writing", text: "Fulana" });
  });

  it("trusts the search mode the server reports over the one the page asked for", () => {
    const state = run([...live(), sourcesEvent(1, "text")]);

    expect(state).toMatchObject({ phase: "writing", searchMode: "text" });
  });

  it("tracks the model download while preparing", () => {
    const state = run([
      { type: "live-requested", requestId: 1, question: "q" },
      {
        type: "model-progress",
        requestId: 1,
        loadedBytes: 120,
        totalBytes: 340,
      },
    ]);

    expect(state).toMatchObject({
      phase: "preparing",
      loadedBytes: 120,
      totalBytes: 340,
    });
  });

  it("marks a slow search, which the page shows as the database waking up", () => {
    expect(run([...live(), { type: "slow", requestId: 1 }])).toMatchObject({
      phase: "searching",
      slow: true,
    });
  });

  it("keeps the partial text and the sources when the stream breaks mid-answer", () => {
    const state = run([
      ...live(),
      sourcesEvent(),
      {
        type: "event",
        requestId: 1,
        at: 2_000,
        event: { type: "delta", text: "Fula" },
      },
      {
        type: "event",
        requestId: 1,
        at: 2_100,
        event: { type: "error", message: "generation failed" },
      },
    ]);

    expect(state).toEqual({
      phase: "failed",
      requestId: 1,
      question: "Quem foi nomeado?",
      reason: "generation",
      sources: [source(1), source(2)],
      partial: "Fula",
    });
  });

  it("fails without sources when the request never got an answer", () => {
    expect(
      run([...live(), { type: "failed", requestId: 1, reason: "unavailable" }]),
    ).toMatchObject({
      phase: "failed",
      reason: "unavailable",
      sources: [],
      partial: "",
    });
  });

  it("ignores events from an older request after the visitor asked something else", () => {
    const state = run([
      ...live(1),
      { type: "example-requested", requestId: 2, question: "Exemplo?" },
      sourcesEvent(1),
      done(1),
      { type: "failed", requestId: 1, reason: "network" },
    ]);

    expect(state).toEqual({
      phase: "loading-example",
      requestId: 2,
      question: "Exemplo?",
    });
  });

  it("does not turn a finished answer into a failure when a late error arrives", () => {
    const answered = run([...live(), sourcesEvent(), done()]);

    expect(
      askReducer(answered, { type: "failed", requestId: 1, reason: "network" }),
    ).toBe(answered);
  });

  it("shows a saved example as an answer that says when it was generated", () => {
    const example: ExampleAnswer = {
      slug: "nomeacoes",
      question: "Quem foi nomeado?",
      answer: "Fulana [1].",
      citations: [1],
      notFound: false,
      sources: [source(1)],
      generatedAt: "2026-10-16T12:00:00.000Z",
    };

    const state = run([
      {
        type: "example-requested",
        requestId: 3,
        question: "Quem foi nomeado?",
      },
      { type: "example-loaded", requestId: 3, example },
    ]);

    expect(state).toMatchObject({
      phase: "answered",
      sources: [source(1)],
      origin: { kind: "example", generatedAt: "2026-10-16T12:00:00.000Z" },
    });
  });

  it("goes back to the start on reset", () => {
    expect(run([...live(), { type: "reset" }])).toEqual({ phase: "idle" });
  });
});

describe("failureForStatus", () => {
  it.each([
    [429, "limit"],
    [503, "unavailable"],
    [500, "network"],
    [400, "network"],
  ] as const)("maps HTTP %i to %s", (status, reason) => {
    expect(failureForStatus(status)).toBe(reason);
  });
});
