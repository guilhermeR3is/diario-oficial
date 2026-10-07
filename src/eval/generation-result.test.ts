import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type GenerationResult,
  appendResult,
  latestResults,
  parseResults,
  readResults,
} from "./generation-result";

const result = (
  id: string,
  overrides: Partial<GenerationResult> = {},
): GenerationResult => ({
  id,
  model: "openai/teste",
  promptVersion: "v1",
  answer: "A portaria saiu [1].",
  notFound: false,
  citations: [1],
  invalidCitations: [],
  sources: [{ sourceUrl: "https://exemplo.test/a.pdf", ordinal: 3 }],
  ...overrides,
});

const line = (value: unknown) => JSON.stringify(value);

describe("parseResults", () => {
  it("reads one result per line and ignores blank lines", () => {
    const raw = `${line(result("q01"))}\n\n${line(result("q02"))}\n`;

    expect(parseResults(raw).map((r) => r.id)).toEqual(["q01", "q02"]);
  });

  it("points at the line when the JSON is broken", () => {
    const raw = `${line(result("q01"))}\n{quebrado`;

    expect(() => parseResults(raw)).toThrow("linha 2: JSON inválido");
  });

  it("points at the line and the field when a result does not fit the format", () => {
    const raw = `${line(result("q01"))}\n${line({ ...result("q02"), notFound: "sim" })}`;

    expect(() => parseResults(raw)).toThrow(/linha 2: notFound/);
  });

  it("refuses a field it does not know, so a typo does not go unnoticed", () => {
    const raw = line({ ...result("q01"), extra: 1 });

    expect(() => parseResults(raw)).toThrow(/linha 1/);
  });

  it("refuses an id that is not a question id", () => {
    expect(() => parseResults(line(result("pergunta1")))).toThrow(/id/);
  });
});

describe("readResults and appendResult", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "generation-results-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("reads an empty list when the file does not exist yet", async () => {
    expect(await readResults(join(directory, "nada.jsonl"))).toEqual([]);
  });

  it("creates the folder, appends in order and reads back what was written", async () => {
    const path = join(directory, "eval", "generation.jsonl");

    await appendResult(path, result("q01"));
    await appendResult(path, result("q02", { notFound: true, citations: [] }));

    expect((await readFile(path, "utf8")).split("\n")).toHaveLength(3);
    expect(await readResults(path)).toEqual([
      result("q01"),
      result("q02", { notFound: true, citations: [] }),
    ]);
  });

  it("does not hide a file that is broken", async () => {
    const path = join(directory, "quebrado.jsonl");
    await writeFile(path, "{quebrado\n");

    await expect(readResults(path)).rejects.toThrow("linha 1: JSON inválido");
  });
});

describe("latestResults", () => {
  const current = { model: "openai/teste", promptVersion: "v1" };

  it("keeps only the results of the model and prompt version asked for", () => {
    const latest = latestResults(
      [
        result("q01"),
        result("q02", { model: "outro/modelo" }),
        result("q03", { promptVersion: "v2" }),
      ],
      current,
    );

    expect([...latest.keys()]).toEqual(["q01"]);
  });

  it("lets a later line for the same question replace the earlier one", () => {
    const latest = latestResults(
      [
        result("q01", { answer: "primeira" }),
        result("q01", { answer: "segunda" }),
      ],
      current,
    );

    expect(latest.get("q01")?.answer).toBe("segunda");
  });
});
