import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prompt } from "./build-prompt";
import { ModelRateLimitError } from "./answer-model";
import { createGroqAnswerModel, rateLimitWindow } from "./groq-answer-model";
import { parseCitations } from "./parse-citations";

const { create, clientCreated, logInfo, logWarn, APIError, RateLimitError } =
  vi.hoisted(() => ({
    create: vi.fn(),
    clientCreated: vi.fn(),
    logInfo: vi.fn(),
    logWarn: vi.fn(),
    // o SDK real só tem status quando a resposta HTTP chegou; conexão caída e erro no meio do stream vêm sem
    APIError: class extends Error {
      constructor(
        readonly status: number | undefined,
        message: string,
      ) {
        super(message);
      }
    },
    // o SDK real devolve os cabeçalhos da resposta 429 no erro
    RateLimitError: class extends Error {
      constructor(readonly headers: Headers) {
        super("429 Rate limit reached");
      }
    },
  }));

vi.mock("groq-sdk", () => ({
  APIError,
  RateLimitError,
  default: class {
    chat = { completions: { create } };
    constructor(options: unknown) {
      clientCreated(options);
    }
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: logInfo, warn: logWarn },
}));

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
  createGroqAnswerModel({
    apiKey: "chave-de-teste",
    model: "openai/teste",
    retryDelayMs: 0,
  });

beforeEach(() => {
  create.mockReset();
  clientCreated.mockClear();
  logInfo.mockClear();
  logWarn.mockClear();
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

  it("returns the total tokens the provider reported, for the query log", async () => {
    const usage = {
      prompt_tokens: 4500,
      completion_tokens: 300,
      total_tokens: 4800,
    };
    create.mockResolvedValue(chunks(chunk("ok"), chunk(null, "stop", usage)));

    const pieces = model().stream(prompt);
    let next = await pieces.next();
    while (!next.done) next = await pieces.next();

    expect(next.value).toBe(4800);
  });

  it("returns no total when the provider reports no usage", async () => {
    create.mockResolvedValue(chunks(chunk("ok", "stop")));

    const pieces = model().stream(prompt);
    let next = await pieces.next();
    while (!next.done) next = await pieces.next();

    expect(next.value).toBeUndefined();
  });

  it("passes the retry count to the client, so the site can turn retries off", () => {
    createGroqAnswerModel({
      apiKey: "chave-de-teste",
      model: "openai/teste",
      maxRetries: 0,
    });

    expect(clientCreated).toHaveBeenCalledWith({
      apiKey: "chave-de-teste",
      maxRetries: 0,
    });
  });

  it.each([
    ["7", "minute"],
    ["60", "minute"],
    ["61", "day"],
    ["3600", "day"],
  ] as const)(
    "turns a 429 asking to wait %s s into a %s rate limit",
    async (retryAfter, window) => {
      create.mockRejectedValue(
        new RateLimitError(new Headers({ "retry-after": retryAfter })),
      );

      const reading = collect(model().stream(prompt));

      await expect(reading).rejects.toBeInstanceOf(ModelRateLimitError);
      await expect(reading).rejects.toMatchObject({ window });
    },
  );

  it("keeps the provider's 429 as the cause, for the server log", async () => {
    const original = new RateLimitError(new Headers({ "retry-after": "3" }));
    create.mockRejectedValue(original);

    await expect(collect(model().stream(prompt))).rejects.toMatchObject({
      cause: original,
    });
  });

  it("tries once more when Groq fails on its side before the first word", async () => {
    create
      .mockRejectedValueOnce(new APIError(503, "503 over capacity"))
      .mockResolvedValueOnce(chunks(chunk("ok", "stop")));

    expect(await collect(model().stream(prompt))).toEqual(["ok"]);
    expect(create).toHaveBeenCalledTimes(2);
    expect(logWarn).toHaveBeenCalledTimes(1);
  });

  it("tries once more when the stream breaks before the first word", async () => {
    create
      .mockResolvedValueOnce(
        (async function* () {
          yield chunk(null);
          throw new APIError(undefined, "Connection error.");
        })(),
      )
      .mockResolvedValueOnce(chunks(chunk("ok", "stop")));

    expect(await collect(model().stream(prompt))).toEqual(["ok"]);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("gives up after the second failure and reports it", async () => {
    create
      .mockRejectedValueOnce(new APIError(500, "500 primeira"))
      .mockRejectedValueOnce(new APIError(502, "502 segunda"));

    await expect(collect(model().stream(prompt))).rejects.toThrow(
      "502 segunda",
    );
    expect(create).toHaveBeenCalledTimes(2);
  });

  it.each([400, 401, 404])(
    "does not repeat a request Groq refused with %i, which would fail the same way",
    async (status) => {
      create.mockRejectedValue(new APIError(status, `${status} recusado`));

      await expect(collect(model().stream(prompt))).rejects.toThrow(
        `${status} recusado`,
      );
      expect(create).toHaveBeenCalledTimes(1);
    },
  );

  it("does not repeat a rate limit, which has its own answer for the visitor", async () => {
    create.mockRejectedValue(
      new RateLimitError(new Headers({ "retry-after": "3" })),
    );

    await expect(collect(model().stream(prompt))).rejects.toBeInstanceOf(
      ModelRateLimitError,
    );
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("does not start over once part of the answer reached the reader", async () => {
    create.mockResolvedValueOnce(
      (async function* () {
        yield chunk("Parte ");
        throw new APIError(undefined, "stream interrompido");
      })(),
    );
    const received: string[] = [];

    const reading = (async () => {
      for await (const piece of model().stream(prompt)) received.push(piece);
    })();

    await expect(reading).rejects.toThrow("stream interrompido");
    expect(received).toEqual(["Parte "]);
    expect(create).toHaveBeenCalledTimes(1);
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

describe("rateLimitWindow", () => {
  it.each([null, "", "  ", "amanhã", "-5"])(
    "assumes the daily limit when the wait is missing or unreadable (%j)",
    (retryAfter) => {
      expect(rateLimitWindow(retryAfter)).toBe("day");
    },
  );

  it("reads a wait of zero seconds as the minute limit", () => {
    expect(rateLimitWindow("0")).toBe("minute");
  });
});
