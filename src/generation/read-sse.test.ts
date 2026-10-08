import { describe, expect, it } from "vitest";
import { encodeSseEvent, toEventStream } from "./event-stream";
import type { AnswerEvent } from "./generate-answer";
import { type SseMessage, readSse } from "./read-sse";

const streamOf = (chunks: Uint8Array[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });

const collect = async (body: ReadableStream<Uint8Array>) => {
  const messages: SseMessage[] = [];
  for await (const message of readSse(body)) messages.push(message);
  return messages;
};

const bytes = (text: string) => new TextEncoder().encode(text);

describe("readSse", () => {
  it("reads several events that arrive in one chunk", async () => {
    const messages = await collect(
      streamOf([bytes("event: a\ndata: 1\n\nevent: b\ndata: 2\n\n")]),
    );

    expect(messages).toEqual([
      { event: "a", data: "1" },
      { event: "b", data: "2" },
    ]);
  });

  it("joins data lines with a line break and names an event that has no name", async () => {
    const messages = await collect(
      streamOf([bytes("data: linha um\ndata: linha dois\n\n")]),
    );

    expect(messages).toEqual([
      { event: "message", data: "linha um\nlinha dois" },
    ]);
  });

  it("joins an event that arrives split across chunks", async () => {
    const messages = await collect(
      streamOf([
        bytes("event: a\nda"),
        bytes("ta: 12"),
        bytes("3\n"),
        bytes("\n"),
      ]),
    );

    expect(messages).toEqual([{ event: "a", data: "123" }]);
  });

  it("keeps a character whose bytes were split between two chunks", async () => {
    const whole = bytes('event: delta\ndata: {"text":"ação"}\n\n');
    const cut = whole.indexOf(0xc3) + 1;

    const messages = await collect(
      streamOf([whole.slice(0, cut), whole.slice(cut)]),
    );

    expect(messages).toEqual([{ event: "delta", data: '{"text":"ação"}' }]);
  });

  it("drops an event that never got its blank line, and one without data", async () => {
    const messages = await collect(
      streamOf([bytes("event: x\n\nevent: a\ndata: 1\n\nevent: b\ndata: 2")]),
    );

    expect(messages).toEqual([{ event: "a", data: "1" }]);
  });

  it("cancels the underlying stream when the reader stops early", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(bytes("event: a\ndata: 1\n\n"));
      },
      cancel() {
        cancelled = true;
      },
    });

    for await (const message of readSse(body)) {
      expect(message.event).toBe("a");
      break;
    }

    expect(cancelled).toBe(true);
  });

  it("reads back what the server encodes", async () => {
    const events: AnswerEvent[] = [
      { type: "delta", text: "O valor é R$ 1.000,00. [1]" },
      { type: "error", message: "generation failed" },
    ];
    async function* source() {
      yield* events;
    }

    const messages = await collect(toEventStream(source()));

    expect(messages).toEqual(
      events.map((event) => ({
        event: event.type,
        data: encodeSseEvent(event).split("data: ")[1].trimEnd(),
      })),
    );
  });
});
