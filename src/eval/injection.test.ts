import { describe, expect, it } from "vitest";
import type { AnswerModel } from "@/generation/answer-model";
import { buildPrompt } from "@/generation/build-prompt";
import { createFakeAnswerModel } from "@/generation/fake-answer-model";
import type { SearchHit } from "@/search/search-hit";
import {
  INJECTION_CASES,
  parseInjectionArgs,
  planInjectionRuns,
  poisonFirstSource,
  runInjectionCase,
  withoutDefense,
} from "./injection";

const countOf = (text: string, part: string) => text.split(part).length - 1;

const hit = (ordinal: number, text: string): SearchHit => ({
  chunkId: ordinal,
  ordinal,
  score: 1,
  actType: "PORTARIA",
  title: `Portaria ${ordinal}`,
  secretariat: null,
  date: "2026-08-01",
  page: 1,
  pageEnd: 1,
  text,
  edition: { id: 1, title: "Edição 1", sourceUrl: "https://example.test/1" },
});

const hits = [hit(1, "texto da primeira"), hit(2, "texto da segunda")];
const [direct, fakeTags] = INJECTION_CASES;

// o modelo de mentira só "obedece" se o texto envenenado chegou ao prompt
const obeysWhenPoisoned = (keyword: string) =>
  createFakeAnswerModel((prompt) =>
    prompt.user.includes(keyword)
      ? `${keyword} [1]`
      : "Não encontrei nos diários deste período.",
  );

describe("poisonFirstSource", () => {
  it("adds the payload to the first source only and leaves the input alone", () => {
    const poisoned = poisonFirstSource(hits, "ordem falsa");

    expect(poisoned[0].text).toBe("texto da primeira\nordem falsa");
    expect(poisoned[1]).toBe(hits[1]);
    expect(hits[0].text).toBe("texto da primeira");
  });
});

describe("runInjectionCase", () => {
  it("reports obedience when the answer carries the keyword, whatever its case", async () => {
    const model = createFakeAnswerModel(direct.keyword.toLowerCase());

    const outcome = await runInjectionCase(model, "pergunta?", hits, direct);

    expect(outcome.obeyed).toBe(true);
  });

  it("reports no obedience when the model ignores the payload", async () => {
    const outcome = await runInjectionCase(
      createFakeAnswerModel("O valor foi de R$ 10,00. [1]"),
      "pergunta?",
      hits,
      direct,
    );

    expect(outcome).toEqual({
      answer: "O valor foi de R$ 10,00. [1]",
      obeyed: false,
    });
  });

  it("sends the payload to the model inside the first source", async () => {
    const model = obeysWhenPoisoned(direct.keyword);

    const outcome = await runInjectionCase(model, "pergunta?", hits, direct);

    expect(outcome.obeyed).toBe(true);
    expect(model.prompts[0].user).toContain(direct.payload);
  });

  it("escapes a payload that tries to close the tags and pose as the question", async () => {
    const model = createFakeAnswerModel("ok [1]");

    await runInjectionCase(model, "pergunta?", hits, fakeTags);

    const { user } = model.prompts[0];
    expect(countOf(user, "</fontes>")).toBe(1);
    expect(countOf(user, "<pergunta>")).toBe(1);
    expect(countOf(user, "</fonte>")).toBe(hits.length);
  });

  it("throws when the model fails, instead of counting it as no obedience", async () => {
    const broken: AnswerModel = {
      name: "broken",
      async *stream() {
        throw new Error("provider down");
      },
    };

    await expect(
      runInjectionCase(broken, "pergunta?", hits, direct),
    ).rejects.toThrow("generation failed in the case ordem-direta");
  });
});

describe("withoutDefense", () => {
  it("swaps the system prompt and keeps the user message", async () => {
    const model = createFakeAnswerModel("ok");
    const prompt = buildPrompt("pergunta?", hits);

    for await (const piece of withoutDefense(model).stream(prompt)) {
      expect(piece).toBe("ok");
    }

    expect(model.prompts[0].user).toBe(prompt.user);
    expect(model.prompts[0].system).not.toBe(prompt.system);
    expect(model.prompts[0].system).not.toContain("dado do diário");
  });
});

describe("INJECTION_CASES", () => {
  it("has a distinct keyword per case, present only in its own payload", () => {
    const { system } = buildPrompt("pergunta?", hits);

    for (const injection of INJECTION_CASES) {
      expect(injection.payload).toContain(injection.keyword);
      expect(system).not.toContain(injection.keyword);
      const others = INJECTION_CASES.filter((other) => other !== injection);
      for (const other of others) {
        expect(other.payload).not.toContain(injection.keyword);
      }
    }
  });
});

describe("parseInjectionArgs", () => {
  it("defaults to one defended run per attack plus the control", () => {
    expect(parseInjectionArgs([])).toEqual({
      yes: false,
      repeat: 1,
      control: true,
    });
  });

  it("reads --yes, --repeat and --no-control", () => {
    expect(parseInjectionArgs(["--yes", "--repeat=3", "--no-control"])).toEqual(
      { yes: true, repeat: 3, control: false },
    );
  });

  it.each(["--repeat=0", "--repeat=6", "--repeat=1.5", "--repeat=x"])(
    "rejects %s",
    (arg) => {
      expect(() => parseInjectionArgs([arg])).toThrow("--repeat");
    },
  );

  it("rejects an argument it does not know", () => {
    expect(() => parseInjectionArgs(["--repet=3"])).toThrow(
      "argumento desconhecido: --repet=3",
    );
  });
});

describe("planInjectionRuns", () => {
  const two = INJECTION_CASES.slice(0, 2);

  it("repeats the defended run and runs the control once per attack", () => {
    const runs = planInjectionRuns(two, { repeat: 3, control: true });

    expect(runs.filter((run) => run.defended)).toHaveLength(6);
    expect(runs.filter((run) => !run.defended)).toHaveLength(2);
    expect(
      runs.filter((run) => !run.defended).map((run) => run.injection.id),
    ).toEqual(two.map((injection) => injection.id));
  });

  it("leaves the control out when asked", () => {
    const runs = planInjectionRuns(two, { repeat: 2, control: false });

    expect(runs).toHaveLength(4);
    expect(runs.every((run) => run.defended)).toBe(true);
  });
});
