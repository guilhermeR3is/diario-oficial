import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prompt } from "./build-prompt";
import { createGroqAnswerModel } from "./groq-answer-model";

const { create, clientCreated, logInfo } = vi.hoisted(() => ({
  create: vi.fn(),
  clientCreated: vi.fn(),
  logInfo: vi.fn(),
}));

vi.mock("groq-sdk", () => ({
  default: class {
    chat = { completions: { create } };
    constructor(options: unknown) {
      clientCreated(options);
    }
  },
}));

vi.mock("@/lib/logger", () => ({ logger: { info: logInfo } }));

const prompt: Prompt = { system: "regras", user: "fontes e pergunta" };

const chunk = (
  content: string | null,
  finishReason: string | null = null,
  usage?: object,
) => ({
  choices: [
    {
      delta: content === null ? {} : { content },
      finish_reason: finishReason,
    },
  ],
  ...(usage ? { x_groq: { usage } } : {}),
});

async function* chunks(...items: object[]) {
  yield* items;
}

async function collect(stream: AsyncIterable<string>) {
  const pieces: string[] = [];
  for await (const piece of stream) pieces.push(piece);
  return pieces;
}

const model = () =>
  createGroqAnswerModel({ apiKey: "chave-de-teste", model: "openai/teste" });

beforeEach(() => {
  create.mockReset();
  clientCreated.mockClear();
  logInfo.mockClear();
});

describe("createGroqAnswerModel", () => {
  it("is named after the model it talks to, so saved answers can say who wrote them", () => {
    expect(model().name).toBe("openai/teste");
  });

  it("gives the Groq client the key it was created with", () => {
    model();

    expect(clientCreated).toHaveBeenCalledWith({ apiKey: "chave-de-teste" });
  });

  it("streams the text of each chunk and skips the ones without text", async () => {
    create.mockResolvedValue(
      chunks(
        chunk(null),
        chunk("A portaria "),
        chunk("saiu [1]."),
        chunk(null, "stop"),
      ),
    );

    expect(await collect(model().stream(prompt))).toEqual([
      "A portaria ",
      "saiu [1].",
    ]);
  });

  it("sends the system prompt and the user message to the chosen model, asking for a stream", async () => {
    create.mockResolvedValue(chunks(chunk("ok", "stop")));

    await collect(model().stream(prompt));

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toMatchObject({
      model: "openai/teste",
      stream: true,
      messages: [
        { role: "system", content: "regras" },
        { role: "user", content: "fontes e pergunta" },
      ],
    });
  });

  it("caps the answer and keeps the model's reasoning short and out of the answer", async () => {
    create.mockResolvedValue(chunks(chunk("ok", "stop")));

    await collect(model().stream(prompt));

    expect(create.mock.calls[0][0]).toMatchObject({
      max_completion_tokens: 1024,
      reasoning_effort: "low",
      include_reasoning: false,
    });
  });

  it("fails after the partial text when the model stops because of the token limit", async () => {
    create.mockResolvedValue(
      chunks(chunk("Resposta cortada"), chunk(null, "length")),
    );
    const received: string[] = [];

    const reading = (async () => {
      for await (const piece of model().stream(prompt)) received.push(piece);
    })();

    await expect(reading).rejects.toThrow(/max_completion_tokens/);
    expect(received).toEqual(["Resposta cortada"]);
  });

  it("does not fail when the model ends on its own", async () => {
    create.mockResolvedValue(chunks(chunk("ok"), chunk(null, "stop")));

    await expect(collect(model().stream(prompt))).resolves.toEqual(["ok"]);
  });

  it("logs the model, how it finished and the token usage, to follow the free quota", async () => {
    const usage = { prompt_tokens: 4500, completion_tokens: 300 };
    create.mockResolvedValue(chunks(chunk("ok"), chunk(null, "stop", usage)));

    await collect(model().stream(prompt));

    expect(logInfo).toHaveBeenCalledWith(
      { model: "openai/teste", finishReason: "stop", usage },
      "groq completion finished",
    );
  });

  it("lets the provider's error reach the caller instead of hiding it", async () => {
    create.mockRejectedValue(new Error("429 rate limit"));

    await expect(collect(model().stream(prompt))).rejects.toThrow(
      "429 rate limit",
    );
  });

  it("closes the Groq stream when the reader stops, which aborts the request", async () => {
    let produced = 0;
    let closed = false;
    create.mockResolvedValue(
      (async function* () {
        try {
          for (const text of ["primeiro ", "segundo ", "terceiro"]) {
            produced += 1;
            yield chunk(text);
          }
        } finally {
          closed = true;
        }
      })(),
    );

    for await (const piece of model().stream(prompt)) {
      if (piece) break;
    }

    // "closed" sozinho também seria verdadeiro se o stream fosse lido até o fim antes
    expect(produced).toBe(1);
    expect(closed).toBe(true);
  });
});
