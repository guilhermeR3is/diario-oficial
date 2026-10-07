import { describe, expect, it } from "vitest";
import type { SearchHit } from "@/search/search-hit";
import type { AnswerModel } from "./answer-model";
import { NOT_FOUND_ANSWER, PROMPT_VERSION, buildPrompt } from "./build-prompt";
import { createFakeAnswerModel } from "./fake-answer-model";
import { type AnswerEvent, generateAnswer } from "./generate-answer";

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
  edition: {
    id: 1,
    title: "Diário Oficial - Edição nº 190/XLVI",
    sourceUrl: "https://exemplo.test/190.pdf",
  },
});

const hits = [hit(1), hit(2), hit(3)];

async function collect(events: AsyncIterable<AnswerEvent>) {
  const collected: AnswerEvent[] = [];
  for await (const event of events) collected.push(event);
  return collected;
}

const types = (events: AnswerEvent[]) => events.map((event) => event.type);

const deltaText = (events: AnswerEvent[]) =>
  events
    .flatMap((event) => (event.type === "delta" ? [event.text] : []))
    .join("");

const doneOf = (events: AnswerEvent[]) => {
  const done = events.find((event) => event.type === "done");
  if (done?.type !== "done") throw new Error("no done event");
  return done;
};

const failingModel = (pieces: string[], failure: Error): AnswerModel => ({
  name: "failing",
  async *stream() {
    yield* pieces;
    throw failure;
  },
});

describe("generateAnswer", () => {
  it("sends the sources first, then the text in pieces, then done", async () => {
    const model = createFakeAnswerModel("O decreto foi publicado [1].");

    const events = await collect(generateAnswer(model, "pergunta", hits));

    expect(events[0]).toEqual({ type: "sources", sources: hits });
    expect(
      types(events)
        .slice(1, -1)
        .every((type) => type === "delta"),
    ).toBe(true);
    expect(events.at(-1)?.type).toBe("done");
    expect(
      types(events).filter((type) => type === "delta").length,
    ).toBeGreaterThan(1);
  });

  it("streams exactly what the model wrote and repeats it whole in done", async () => {
    const reply = "O decreto foi publicado em setembro [1].";
    const model = createFakeAnswerModel(reply);

    const events = await collect(generateAnswer(model, "pergunta", hits));

    expect(deltaText(events)).toBe(reply);
    expect(doneOf(events).answer).toBe(reply);
  });

  it("gives the model the prompt built from the question and the sources", async () => {
    const model = createFakeAnswerModel("ok [1]");

    await collect(generateAnswer(model, "Quem foi nomeado?", hits));

    expect(model.prompts).toEqual([buildPrompt("Quem foi nomeado?", hits)]);
  });

  it("reads the citations from the whole text, even when one is split between two pieces", async () => {
    const model = createFakeAnswerModel("123456[2] fim", 7);

    const events = await collect(generateAnswer(model, "pergunta", hits));

    expect(doneOf(events).citations).toEqual([2]);
  });

  it("lists valid citations apart from numbers that point to no source", async () => {
    const model = createFakeAnswerModel(
      "Fato [1] e outro [3] e falso [9] e [0].",
    );

    const done = doneOf(await collect(generateAnswer(model, "pergunta", hits)));

    expect(done.citations).toEqual([1, 3]);
    expect(done.invalidCitations).toEqual([0, 9]);
  });

  it("flags the refusal sentence as not found", async () => {
    const model = createFakeAnswerModel(NOT_FOUND_ANSWER);

    const done = doneOf(await collect(generateAnswer(model, "pergunta", hits)));

    expect(done.notFound).toBe(true);
    expect(done.citations).toEqual([]);
  });

  it("does not flag a cited answer as not found", async () => {
    const model = createFakeAnswerModel("O decreto foi publicado [1].");

    const done = doneOf(await collect(generateAnswer(model, "pergunta", hits)));

    expect(done.notFound).toBe(false);
  });

  it("trims the whole answer in done but streams the pieces as they came", async () => {
    const reply = "  \nFato [1].\n";
    const model = createFakeAnswerModel(reply);

    const events = await collect(generateAnswer(model, "pergunta", hits));

    expect(deltaText(events)).toBe(reply);
    expect(doneOf(events).answer).toBe("Fato [1].");
  });

  it("says which model and which prompt version wrote the answer", async () => {
    const model = createFakeAnswerModel("ok [1]");

    const done = doneOf(await collect(generateAnswer(model, "pergunta", hits)));

    expect(done.model).toBe("fake");
    expect(done.promptVersion).toBe(PROMPT_VERSION);
  });

  it("answers not found without calling the model when there are no sources", async () => {
    const model = createFakeAnswerModel("isto não deveria ser dito [1]");

    const events = await collect(generateAnswer(model, "pergunta", []));

    expect(model.prompts).toEqual([]);
    expect(events[0]).toEqual({ type: "sources", sources: [] });
    expect(deltaText(events)).toBe(NOT_FOUND_ANSWER);
    expect(doneOf(events)).toMatchObject({
      answer: NOT_FOUND_ANSWER,
      notFound: true,
      citations: [],
      invalidCitations: [],
    });
  });

  it("ends with an error, and no done, when the model fails halfway", async () => {
    const model = failingModel(
      ["Fato ", "parcial"],
      new Error("falha interna"),
    );

    const events = await collect(generateAnswer(model, "pergunta", hits));

    expect(types(events)).toEqual(["sources", "delta", "delta", "error"]);
    expect(deltaText(events)).toBe("Fato parcial");
  });

  it("ends with an error when the model fails before writing anything", async () => {
    const model = failingModel([], new Error("falha interna"));

    const events = await collect(generateAnswer(model, "pergunta", hits));

    expect(types(events)).toEqual(["sources", "error"]);
  });

  it("does not pass the provider's error message on to the client", async () => {
    const model = failingModel(
      [],
      new Error("provider exploded: internal detail 42"),
    );

    const events = await collect(generateAnswer(model, "pergunta", hits));

    const error = events.find((event) => event.type === "error");
    expect(error).toEqual({ type: "error", message: "generation failed" });
    expect(JSON.stringify(events)).not.toContain("internal detail");
  });

  it.each(["", "   \n"])(
    "ends with an error when the model writes nothing (%j)",
    async (reply) => {
      const model = createFakeAnswerModel(reply);

      const events = await collect(generateAnswer(model, "pergunta", hits));

      expect(types(events)).not.toContain("done");
      expect(events.at(-1)).toEqual({
        type: "error",
        message: "generation failed",
      });
    },
  );

  it("stops the model when the reader stops listening, so no more quota is spent", async () => {
    let produced = 0;
    let stopped = false;
    const model: AnswerModel = {
      name: "slow",
      async *stream() {
        try {
          for (const piece of ["primeiro ", "segundo ", "terceiro"]) {
            produced += 1;
            yield piece;
          }
        } finally {
          stopped = true;
        }
      },
    };

    for await (const event of generateAnswer(model, "pergunta", hits)) {
      if (event.type === "delta") break;
    }

    // "stopped" sozinho também seria verdadeiro se o modelo fosse lido até o fim antes
    expect(produced).toBe(1);
    expect(stopped).toBe(true);
  });
});
