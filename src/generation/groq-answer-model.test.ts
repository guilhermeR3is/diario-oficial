import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prompt } from "./build-prompt";
import { createGroqAnswerModel } from "./groq-answer-model";
import { parseCitations } from "./parse-citations";

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

  it("asks for the output cap it was given, which some models need to be lower", async () => {
    create.mockResolvedValue(chunks(chunk("ok", "stop")));

    await collect(
      createGroqAnswerModel({
        apiKey: "chave-de-teste",
        model: "openai/teste",
        maxCompletionTokens: 800,
      }).stream(prompt),
    );

    expect(create.mock.calls[0][0]).toMatchObject({
      max_completion_tokens: 800,
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

  describe("plain typography", () => {
    const code = (point: number) => String.fromCodePoint(point);
    const LEFT = code(0x3010);
    const RIGHT = code(0x3011);

    async function written(...pieces: string[]) {
      create.mockResolvedValue(
        chunks(...pieces.map((piece) => chunk(piece)), chunk(null, "stop")),
      );
      return collect(model().stream(prompt));
    }

    it("turns the lenticular brackets the model likes into square brackets", async () => {
      const pieces = await written(`Fato${LEFT}1${RIGHT}${LEFT}4${RIGHT}.`);

      expect(pieces.join("")).toBe("Fato[1][4].");
    });

    it("works piece by piece, so a bracket split by the streaming still ends up square", async () => {
      const pieces = await written(`Fato${LEFT}`, "12", `${RIGHT}.`);

      expect(pieces).toEqual(["Fato[", "12", "]."]);
    });

    it("also turns the full-width square brackets into square brackets", async () => {
      const pieces = await written(`Fato${code(0xff3b)}2${code(0xff3d)}`);

      expect(pieces.join("")).toBe("Fato[2]");
    });

    it("replaces no-break spaces and the non-breaking hyphen of a CNPJ", async () => {
      const pieces = await written(
        `CNPJ 45.734.817/0001${code(0x2011)}21${code(0x202f)}[1]${code(0x00a0)}ok`,
      );

      expect(pieces.join("")).toBe("CNPJ 45.734.817/0001-21 [1] ok");
    });

    it("leaves accents, the ordinal sign and ordinary dashes alone", async () => {
      const text = `nº 56/2026 ${code(0x2014)} João, art. 5º ${code(0x2013)} a-b`;

      expect((await written(text)).join("")).toBe(text);
    });

    it("gives parseCitations a citation it can read, which is the point of all this", async () => {
      const pieces = await written(
        `O convênio é com a entidade${LEFT}1${RIGHT}.`,
      );

      expect(parseCitations(pieces.join(""), 6).cited).toEqual([1]);
    });
  });
});
