import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { appendJsonl, parseJsonl, readJsonl } from "./jsonl-store";

const schema = z.strictObject({ id: z.string(), value: z.number() });

describe("parseJsonl", () => {
  it("reads one record per line and ignores blank lines", () => {
    const raw = '{"id":"a","value":1}\n\n{"id":"b","value":2}\n';

    expect(parseJsonl(raw, schema)).toEqual([
      { id: "a", value: 1 },
      { id: "b", value: 2 },
    ]);
  });

  it("points at the line when the JSON is broken", () => {
    expect(() => parseJsonl('{"id":"a","value":1}\n{quebrado', schema)).toThrow(
      "linha 2: JSON inválido",
    );
  });

  it("points at the line and the field when a record does not fit the schema", () => {
    expect(() =>
      parseJsonl('{"id":"a","value":1}\n{"id":"b","value":"x"}', schema),
    ).toThrow(/linha 2: value/);
  });

  it("names the line itself when the problem is not in one field", () => {
    expect(() =>
      parseJsonl('{"id":"a","value":1,"extra":true}', schema),
    ).toThrow(/linha 1: \(linha\)/);
  });
});

describe("readJsonl and appendJsonl", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "jsonl-store-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("reads an empty list when the file does not exist yet", async () => {
    expect(await readJsonl(join(directory, "nada.jsonl"), schema)).toEqual([]);
  });

  it("creates the folder, appends one line per record and reads them back in order", async () => {
    const path = join(directory, "a", "b", "dados.jsonl");

    await appendJsonl(path, { id: "a", value: 1 });
    await appendJsonl(path, { id: "b", value: 2 });

    expect(await readFile(path, "utf8")).toBe(
      '{"id":"a","value":1}\n{"id":"b","value":2}\n',
    );
    expect(await readJsonl(path, schema)).toEqual([
      { id: "a", value: 1 },
      { id: "b", value: 2 },
    ]);
  });

  it("does not hide a file that is broken", async () => {
    const path = join(directory, "quebrado.jsonl");
    await writeFile(path, "{quebrado\n");

    await expect(readJsonl(path, schema)).rejects.toThrow(
      "linha 1: JSON inválido",
    );
  });

  it("lets an error other than a missing file reach the caller", async () => {
    await expect(readJsonl(directory, schema)).rejects.toThrow();
  });
});
