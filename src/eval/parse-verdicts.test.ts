import { describe, expect, it } from "vitest";
import { parseVerdicts } from "./parse-verdicts";

const json = (claims: unknown[]) => JSON.stringify({ claims });
const verdict = (id: number, supported = true) => ({
  id,
  supported,
  reason: `motivo ${id}`,
});

describe("parseVerdicts", () => {
  it("reads the verdict of each claim", () => {
    expect(
      parseVerdicts(json([verdict(1), verdict(2, false)]), [1, 2]),
    ).toEqual({
      ok: true,
      verdicts: [
        { id: 1, supported: true, reason: "motivo 1" },
        { id: 2, supported: false, reason: "motivo 2" },
      ],
    });
  });

  it("gives the verdicts back in id order", () => {
    const result = parseVerdicts(json([verdict(2), verdict(1)]), [1, 2]);

    expect(result.ok && result.verdicts.map((v) => v.id)).toEqual([1, 2]);
  });

  it("finds the JSON inside a code fence and after a sentence of preamble", () => {
    const text = `Segue o resultado:\n\`\`\`json\n${json([verdict(1)])}\n\`\`\``;

    expect(parseVerdicts(text, [1]).ok).toBe(true);
  });

  it("ignores the thinking some models leave in the text, even when it has braces", () => {
    const text = `<think>talvez {"claims": [] } seja o formato</think>\n${json([verdict(1)])}`;

    expect(parseVerdicts(text, [1])).toMatchObject({ ok: true });
  });

  it("does not depend on the order in which the expected ids were listed", () => {
    expect(parseVerdicts(json([verdict(1), verdict(2)]), [2, 1])).toMatchObject(
      {
        ok: true,
      },
    );
  });

  it("accepts an empty list when there was nothing to check", () => {
    expect(parseVerdicts(json([]), [])).toEqual({ ok: true, verdicts: [] });
  });

  it.each([
    ["there is no JSON", "não consegui avaliar", "sem JSON na resposta"],
    ["the JSON is broken", '{"claims": [', "sem JSON na resposta"],
    ["the JSON is broken inside", '{"claims": [,]}', "JSON inválido"],
    [
      "the format is not the one asked",
      '{"afirmacoes": []}',
      "formato inesperado",
    ],
    [
      "supported is not a boolean",
      json([{ id: 1, supported: "sim", reason: "x" }]),
      "formato inesperado",
    ],
  ])("fails, and says why, when %s", (_, text, reason) => {
    expect(parseVerdicts(text, [1])).toEqual({ ok: false, reason });
  });

  it.each([
    ["a claim is missing", json([verdict(1)]), [1, 2]],
    ["a claim comes twice", json([verdict(1), verdict(1)]), [1, 2]],
    [
      "there is a claim nobody asked about",
      json([verdict(1), verdict(2), verdict(3)]),
      [1, 2],
    ],
    [
      "the ids are other than the asked ones",
      json([verdict(5), verdict(6)]),
      [1, 2],
    ],
  ])("fails when %s", (_, text, expected) => {
    const result = parseVerdicts(text, expected);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain(
      `ids esperados ${expected.join(",")}`,
    );
  });
});
