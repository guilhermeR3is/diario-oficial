import { describe, expect, it } from "vitest";
import { encodeSseEvent, toEventStream } from "./event-stream";
import type { AnswerEvent } from "./generate-answer";

async function* eventsOf(...items: AnswerEvent[]) {
  yield* items;
}

describe("encodeSseEvent", () => {
  it("writes the event name and the whole event as JSON, ending with a blank line", () => {
    expect(encodeSseEvent({ type: "delta", text: "Olá" })).toBe(
      'event: delta\ndata: {"type":"delta","text":"Olá"}\n\n',
    );
  });

  it("keeps a text with line breaks on a single data line", () => {
    const encoded = encodeSseEvent({ type: "delta", text: "linha 1\nlinha 2" });

    expect(encoded.split("\n")).toEqual([
      "event: delta",
      'data: {"type":"delta","text":"linha 1\\nlinha 2"}',
      "",
      "",
    ]);
  });

  it("round-trips every kind of event through its data line", () => {
    const events: AnswerEvent[] = [
      { type: "sources", sources: [] },
      { type: "delta", text: "texto" },
      {
        type: "done",
        answer: "texto [1]",
        notFound: false,
        citations: [1],
        invalidCitations: [],
        model: "fake",
        promptVersion: "v1",
      },
      { type: "error", message: "generation failed" },
    ];

    for (const event of events) {
      const data = encodeSseEvent(event).split("\n")[1].replace("data: ", "");
      expect(JSON.parse(data)).toEqual(event);
    }
  });
});

describe("toEventStream", () => {
  it("sends every event in order and then closes", async () => {
    const stream = toEventStream(
      eventsOf(
        { type: "delta", text: "a" },
        { type: "delta", text: "b" },
        { type: "error", message: "generation failed" },
      ),
    );

    const body = await new Response(stream).text();

    expect(body).toBe(
      [
        encodeSseEvent({ type: "delta", text: "a" }),
        encodeSseEvent({ type: "delta", text: "b" }),
        encodeSseEvent({ type: "error", message: "generation failed" }),
      ].join(""),
    );
  });

  it("encodes accented text as UTF-8", async () => {
    const stream = toEventStream(
      eventsOf({ type: "delta", text: "açúcar e pão" }),
    );

    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());

    expect(new TextDecoder().decode(bytes)).toContain("açúcar e pão");
  });

  it("stops the event source when the browser closes the connection", async () => {
    let produced = 0;
    let stopped = false;
    async function* endless(): AsyncGenerator<AnswerEvent> {
      try {
        for (;;) {
          produced += 1;
          yield { type: "delta", text: "x" };
        }
      } finally {
        stopped = true;
      }
    }
    const reader = toEventStream(endless()).getReader();

    await reader.read();
    await reader.cancel();

    expect(stopped).toBe(true);
    // a fila interna da stream guarda poucos eventos: ela não lê a fonte sem parar
    expect(produced).toBeLessThan(5);
  });
});
