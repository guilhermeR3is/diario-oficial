import { describe, expect, it } from "vitest";
import { parseAnswer, parseInline } from "./answer-segments";

const text = (value: string) => ({ kind: "text", text: value });
const cite = (...numbers: number[]) => ({ kind: "citation", numbers });

describe("parseInline", () => {
  it("splits text and citations, including a citation glued to the word before it", () => {
    expect(parseInline("valor de R$ 18.200,00[1] e outro [3].", 6)).toEqual([
      text("valor de R$ 18.200,00"),
      cite(1),
      text(" e outro "),
      cite(3),
      text("."),
    ]);
  });

  it("reads a citation with several sources and loose spaces", () => {
    expect(parseInline("Saiu [ 1 , 2 ]", 6)).toEqual([
      text("Saiu "),
      cite(1, 2),
    ]);
  });

  it("leaves a citation to a source that does not exist as plain text", () => {
    expect(parseInline("Saiu [9] e [2, 7].", 6)).toEqual([
      text("Saiu [9] e [2, 7]."),
    ]);
  });

  it("renders bold, with citations inside it", () => {
    expect(parseInline("A **Lei n.º 8.026 [1]** saiu.", 6)).toEqual([
      text("A "),
      { kind: "bold", children: [text("Lei n.º 8.026 "), cite(1)] },
      text(" saiu."),
    ]);
  });

  it("keeps an unclosed bold or bracket as text, as happens in the middle of the stream", () => {
    expect(parseInline("A **Lei [1", 6)).toEqual([text("A **Lei [1")]);
  });
});

describe("parseAnswer", () => {
  it("turns blank lines into paragraphs and single breaks into lines of the same paragraph", () => {
    const blocks = parseAnswer("Primeiro [1].  \nSegundo [2].\n\nTerceiro.", 6);

    expect(blocks).toEqual([
      {
        kind: "paragraph",
        lines: [
          [text("Primeiro "), cite(1), text(".")],
          [text("Segundo "), cite(2), text(".")],
        ],
      },
      { kind: "paragraph", lines: [[text("Terceiro.")]] },
    ]);
  });

  it("groups lines that start with a dash into one list", () => {
    expect(parseAnswer("Foram nomeados:\n- Ana [1]\n- Beto [2]", 6)).toEqual([
      { kind: "paragraph", lines: [[text("Foram nomeados:")]] },
      {
        kind: "list",
        items: [
          [text("Ana "), cite(1)],
          [text("Beto "), cite(2)],
        ],
      },
    ]);
  });

  it("returns nothing for an empty answer", () => {
    expect(parseAnswer("  \n\n ", 6)).toEqual([]);
  });
});
