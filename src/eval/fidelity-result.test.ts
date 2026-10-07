import { describe, expect, it } from "vitest";
import {
  type FidelityResult,
  latestFidelity,
  parseFidelityResults,
} from "./fidelity-result";

const result = (
  id: string,
  overrides: Partial<FidelityResult> = {},
): FidelityResult => ({
  id,
  verifier: "qwen/teste",
  promptVersion: "v1",
  answer: "O decreto saiu [1].",
  claims: [
    {
      text: "O decreto saiu",
      citations: [1],
      supported: true,
      reason: "consta no trecho",
    },
  ],
  ...overrides,
});

describe("parseFidelityResults", () => {
  it("reads what was written", () => {
    const raw = `${JSON.stringify(result("q01"))}\n${JSON.stringify(result("q02"))}\n`;

    expect(parseFidelityResults(raw)).toEqual([result("q01"), result("q02")]);
  });

  it("refuses a claim whose verdict is not a boolean, and says which line", () => {
    const broken = result("q01", {
      claims: [
        { text: "x", citations: [1], supported: "sim" as never, reason: "y" },
      ],
    });

    expect(() => parseFidelityResults(JSON.stringify(broken))).toThrow(
      /linha 1: claims\.0\.supported/,
    );
  });

  it("refuses a field it does not know", () => {
    const raw = JSON.stringify({ ...result("q01"), extra: 1 });

    expect(() => parseFidelityResults(raw)).toThrow(/linha 1/);
  });
});

describe("latestFidelity", () => {
  const current = { verifier: "qwen/teste", promptVersion: "v1" };

  it("keeps only the checks of the verifier and prompt version asked for", () => {
    const latest = latestFidelity(
      [
        result("q01"),
        result("q02", { verifier: "outro/modelo" }),
        result("q03", { promptVersion: "v2" }),
      ],
      current,
    );

    expect([...latest.keys()]).toEqual(["q01"]);
  });

  it("lets a later line for the same question replace the earlier one", () => {
    const latest = latestFidelity(
      [
        result("q01", { answer: "primeira" }),
        result("q01", { answer: "segunda" }),
      ],
      current,
    );

    expect(latest.get("q01")?.answer).toBe("segunda");
  });
});
