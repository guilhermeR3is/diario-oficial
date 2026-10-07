import { describe, expect, it } from "vitest";
import type { AnswerModel } from "@/generation/answer-model";
import { createFakeAnswerModel } from "@/generation/fake-answer-model";
import { FIDELITY_PROMPT_VERSION } from "./fidelity-prompt";
import type { FidelityResult } from "./fidelity-result";
import type { GenerationResult } from "./generation-result";
import type { ChunkKey } from "./questions";
import { checkFidelity, pendingFidelity } from "./run-fidelity";

const key = (ordinal: number): ChunkKey => ({
  sourceUrl: "https://exemplo.test/a.pdf",
  ordinal,
});

const generation = (
  id: string,
  overrides: Partial<GenerationResult> = {},
): GenerationResult => ({
  id,
  model: "gen/modelo",
  promptVersion: "v1",
  answer: "O decreto saiu [1]. A multa é de R$ 10 [2][3].",
  notFound: false,
  citations: [1, 2, 3],
  invalidCitations: [],
  sources: [key(10), key(20), key(30)],
  ...overrides,
});

const texts = new Map([
  [10, "texto do trecho dez"],
  [20, "texto do trecho vinte"],
  [30, "texto do trecho trinta"],
]);
const textOf = (k: ChunkKey) => texts.get(k.ordinal);

// responde como um verificador bem-comportado: tudo sustentado, menos os ids pedidos
const verifierSaying = (unsupportedIds: number[] = []) =>
  createFakeAnswerModel((prompt) => {
    const ids = [...prompt.user.matchAll(/<afirmacao id="(\d+)"/g)].map((m) =>
      Number(m[1]),
    );
    return JSON.stringify({
      claims: ids.map((id) => ({
        id,
        supported: !unsupportedIds.includes(id),
        reason: `motivo ${id}`,
      })),
    });
  });

describe("checkFidelity", () => {
  it("sends every claim in one call, with only the sources that were cited", async () => {
    const answer = "Fato A [1]. Fato B [3].";
    const verifier = verifierSaying();

    await checkFidelity(generation("q01", { answer }), { verifier, textOf });

    expect(verifier.prompts).toHaveLength(1);
    const { user } = verifier.prompts[0];
    expect(user).toContain("texto do trecho dez");
    expect(user).toContain("texto do trecho trinta");
    expect(user).not.toContain("texto do trecho vinte");
    expect(user).toContain('<afirmacao id="1" fontes="1">Fato A</afirmacao>');
    expect(user).toContain('<afirmacao id="2" fontes="3">Fato B</afirmacao>');
  });

  it("gives each claim back with its text, its citations and the verdict", async () => {
    const result = await checkFidelity(generation("q01"), {
      verifier: verifierSaying([2]),
      textOf,
    });

    expect(result?.claims).toEqual([
      {
        text: "O decreto saiu",
        citations: [1],
        supported: true,
        reason: "motivo 1",
      },
      {
        text: "A multa é de R$ 10",
        citations: [2, 3],
        supported: false,
        reason: "motivo 2",
      },
    ]);
  });

  it("records who checked, with which prompt, and which answer was checked", async () => {
    const result = await checkFidelity(generation("q07"), {
      verifier: verifierSaying(),
      textOf,
    });

    expect(result).toMatchObject({
      id: "q07",
      verifier: "fake",
      promptVersion: FIDELITY_PROMPT_VERSION,
      answer: "O decreto saiu [1]. A multa é de R$ 10 [2][3].",
    });
  });

  it("marks a claim without a valid citation as unsupported, without asking the verifier about it", async () => {
    const answer = "Fato A [1]. Fato inventado sem fonte.";
    const verifier = verifierSaying();

    const result = await checkFidelity(generation("q01", { answer }), {
      verifier,
      textOf,
    });

    expect(result?.claims[1]).toEqual({
      text: "Fato inventado sem fonte.",
      citations: [],
      supported: false,
      reason: "sem citação válida",
    });
    expect(verifier.prompts[0].user).not.toContain("Fato inventado");
  });

  it("treats a citation that points to no source as no citation", async () => {
    const answer = "Fato A [1]. Fato B [9].";
    const verifier = verifierSaying();

    const result = await checkFidelity(generation("q01", { answer }), {
      verifier,
      textOf,
    });

    expect(result?.claims[1]).toMatchObject({
      citations: [9],
      supported: false,
      reason: "sem citação válida",
    });
    expect(verifier.prompts[0].user).not.toContain("Fato B");
  });

  it("sends only the valid part of a mixed citation, and keeps the original numbers in the result", async () => {
    const verifier = verifierSaying();

    const result = await checkFidelity(
      generation("q01", { answer: "Fato [1][9]." }),
      {
        verifier,
        textOf,
      },
    );

    expect(verifier.prompts[0].user).toContain('fontes="1"');
    expect(result?.claims[0].citations).toEqual([1, 9]);
  });

  it("keeps the claims in the order of the answer when only some of them are sent", async () => {
    const answer = "Sem fonte aqui [9]. Com fonte [2]. Outra sem fonte.";

    const result = await checkFidelity(generation("q01", { answer }), {
      verifier: verifierSaying([1]),
      textOf,
    });

    expect(result?.claims.map((c) => [c.text, c.supported, c.reason])).toEqual([
      ["Sem fonte aqui", false, "sem citação válida"],
      ["Com fonte", false, "motivo 1"],
      ["Outra sem fonte.", false, "sem citação válida"],
    ]);
  });

  it("does not call the verifier when no claim has a valid citation", async () => {
    const verifier = verifierSaying();

    const result = await checkFidelity(
      generation("q01", { answer: "Fato sem fonte.", citations: [] }),
      { verifier, textOf },
    );

    expect(verifier.prompts).toEqual([]);
    expect(result?.claims).toHaveLength(1);
  });

  it("asks again once when the verifier answers something that cannot be read", async () => {
    let calls = 0;
    const verifier = createFakeAnswerModel((prompt) => {
      calls += 1;
      if (calls === 1) return "não consegui avaliar";
      return JSON.stringify({
        claims: [...prompt.user.matchAll(/<afirmacao id="(\d+)"/g)].map(
          (m) => ({
            id: Number(m[1]),
            supported: true,
            reason: "ok",
          }),
        ),
      });
    });

    const result = await checkFidelity(generation("q01"), { verifier, textOf });

    expect(verifier.prompts).toHaveLength(2);
    expect(result?.claims.every((c) => c.supported)).toBe(true);
  });

  it("gives up after two unreadable answers and returns null", async () => {
    const verifier = createFakeAnswerModel("sempre texto livre");

    expect(
      await checkFidelity(generation("q01"), { verifier, textOf }),
    ).toBeNull();
    expect(verifier.prompts).toHaveLength(2);
  });

  it("returns null without asking again when the call itself fails", async () => {
    let calls = 0;
    const failing: AnswerModel = {
      name: "failing",
      async *stream() {
        calls += 1;
        yield* [] as string[];
        throw new Error("429");
      },
    };

    expect(
      await checkFidelity(generation("q01"), { verifier: failing, textOf }),
    ).toBeNull();
    expect(calls).toBe(1);
  });

  it("fails loudly when a cited chunk is no longer in the database", async () => {
    await expect(
      checkFidelity(generation("q01"), {
        verifier: verifierSaying(),
        textOf: () => undefined,
      }),
    ).rejects.toThrow(/não está no banco/);
  });

  it("finds nothing to ask when the answer has no claim at all", async () => {
    const verifier = verifierSaying();

    const result = await checkFidelity(generation("q01", { answer: "   " }), {
      verifier,
      textOf,
    });

    expect(verifier.prompts).toEqual([]);
    expect(result?.claims).toEqual([]);
  });

  it("treats [0] as a citation that points to no source", async () => {
    const verifier = verifierSaying();

    const result = await checkFidelity(
      generation("q01", { answer: "Fato A [1]. Fato B [0]." }),
      { verifier, textOf },
    );

    expect(result?.claims[1]).toMatchObject({
      supported: false,
      reason: "sem citação válida",
    });
    expect(verifier.prompts[0].user).not.toContain("Fato B");
  });

  it("lists the sources in ascending order, whatever order the answer cites them in", async () => {
    const verifier = verifierSaying();

    await checkFidelity(
      generation("q01", { answer: "Fato B [3]. Fato A [1]." }),
      {
        verifier,
        textOf,
      },
    );

    const { user } = verifier.prompts[0];
    expect(user.indexOf("texto do trecho dez")).toBeLessThan(
      user.indexOf("texto do trecho trinta"),
    );
  });

  it("shows each cited source once, even when several claims cite it", async () => {
    const verifier = verifierSaying();

    await checkFidelity(
      generation("q01", { answer: "Fato A [1]. Fato B [1]." }),
      {
        verifier,
        textOf,
      },
    );

    expect(verifier.prompts[0].user.split('<fonte n="1">')).toHaveLength(2);
  });
});

describe("pendingFidelity", () => {
  const current = { verifier: "fake", promptVersion: FIDELITY_PROMPT_VERSION };
  const checked = (
    id: string,
    answer: string,
    overrides: Partial<FidelityResult> = {},
  ): FidelityResult => ({
    id,
    verifier: "fake",
    promptVersion: FIDELITY_PROMPT_VERSION,
    answer,
    claims: [],
    ...overrides,
  });
  const generations = [
    generation("q03"),
    generation("q36", {
      notFound: true,
      answer: "Não encontrei nos diários deste período.",
      citations: [],
    }),
    generation("q01"),
    generation("q02"),
  ];

  it("lists the answers by id and leaves out the refusals", () => {
    expect(pendingFidelity(generations, [], current).map((g) => g.id)).toEqual([
      "q01",
      "q02",
      "q03",
    ]);
  });

  it("skips an answer that was already checked", () => {
    const checks = [checked("q01", generation("q01").answer)];

    expect(
      pendingFidelity(generations, checks, current).map((g) => g.id),
    ).toEqual(["q02", "q03"]);
  });

  it("asks again when the answer was redone since the check", () => {
    const checks = [checked("q01", "uma resposta antiga [1]")];

    expect(
      pendingFidelity(generations, checks, current).map((g) => g.id),
    ).toContain("q01");
  });

  it("asks again when the check came from another verifier or another prompt version", () => {
    const checks = [
      checked("q01", generation("q01").answer, { verifier: "outro/modelo" }),
      checked("q02", generation("q02").answer, { promptVersion: "v0" }),
    ];

    expect(
      pendingFidelity(generations, checks, current).map((g) => g.id),
    ).toEqual(["q01", "q02", "q03"]);
  });

  it("asks again the answers listed in redo, even though they were checked", () => {
    const checks = [
      checked("q01", generation("q01").answer),
      checked("q02", generation("q02").answer),
    ];

    expect(
      pendingFidelity(generations, checks, current, { redo: ["q02"] }).map(
        (g) => g.id,
      ),
    ).toEqual(["q02", "q03"]);
  });

  it("cuts the batch at the limit after ordering", () => {
    expect(
      pendingFidelity(generations, [], current, { limit: 2 }).map((g) => g.id),
    ).toEqual(["q01", "q02"]);
  });

  it("refuses a redo id that has no answer to check, which includes the refusals", () => {
    expect(() =>
      pendingFidelity(generations, [], current, { redo: ["q36", "q99"] }),
    ).toThrow("--redo: q36, q99 não tem resposta para conferir");
  });

  it("does not reorder the list it received", () => {
    const before = generations.map((g) => g.id);

    pendingFidelity(generations, [], current);

    expect(generations.map((g) => g.id)).toEqual(before);
  });
});
