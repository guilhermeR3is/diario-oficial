import { describe, expect, it } from "vitest";
import type { Prompt } from "./build-prompt";
import { createFakeAnswerModel } from "./fake-answer-model";

const prompt: Prompt = { system: "regras", user: "fontes e pergunta" };

async function collect(stream: AsyncIterable<string>) {
  const pieces: string[] = [];
  for await (const piece of stream) pieces.push(piece);
  return pieces;
}

describe("createFakeAnswerModel", () => {
  it("streams the reply in pieces that add up to the whole text", async () => {
    const reply = "A portaria foi publicada em setembro [1].";
    const model = createFakeAnswerModel(reply);

    const pieces = await collect(model.stream(prompt));

    expect(pieces.join("")).toBe(reply);
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.every((piece) => piece.length <= 7)).toBe(true);
  });

  it("can split a citation between two pieces, which is the case the callers must handle", async () => {
    const model = createFakeAnswerModel("123456[12] fim");

    const pieces = await collect(model.stream(prompt));

    expect(pieces[0].endsWith("[")).toBe(true);
    expect(pieces[1].startsWith("12]")).toBe(true);
  });

  it("uses the piece length it is given", async () => {
    const model = createFakeAnswerModel("abcdef", 2);

    expect(await collect(model.stream(prompt))).toEqual(["ab", "cd", "ef"]);
  });

  it("records every prompt it receives", async () => {
    const model = createFakeAnswerModel("ok");
    const other: Prompt = { system: "outras regras", user: "outra pergunta" };

    await collect(model.stream(prompt));
    await collect(model.stream(other));

    expect(model.prompts).toEqual([prompt, other]);
  });

  it("can build the reply from the prompt it receives", async () => {
    const model = createFakeAnswerModel((received) =>
      received.user.toUpperCase(),
    );

    const pieces = await collect(model.stream(prompt));

    expect(pieces.join("")).toBe("FONTES E PERGUNTA");
  });

  it("streams nothing for an empty reply", async () => {
    const model = createFakeAnswerModel("");

    expect(await collect(model.stream(prompt))).toEqual([]);
  });

  it("is named so that saved answers can say who wrote them", () => {
    expect(createFakeAnswerModel("ok").name).toBe("fake");
  });
});
