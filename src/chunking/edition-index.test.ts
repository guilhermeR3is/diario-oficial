import { describe, expect, it } from "vitest";
import { parseIndex } from "./edition-index";

const DOTS = ".".repeat(60);

describe("parseIndex", () => {
  it("reads title and page of each item, which end with a line of dots", () => {
    const page = [
      "ÍNDICE - PREFEITURA MUNICIPAL DE SÃO LUÍS 4",
      DOTS,
      "DECRETO N.º 62.682, DE 01 DE JULHO DE 2026 4",
      DOTS,
    ].join("\n");

    expect(parseIndex([page])).toEqual({
      items: [
        { title: "ÍNDICE - PREFEITURA MUNICIPAL DE SÃO LUÍS", page: 4 },
        { title: "DECRETO N.º 62.682, DE 01 DE JULHO DE 2026", page: 4 },
      ],
      pageCount: 1,
      unreadable: [],
    });
  });

  it("joins a title that wraps onto several lines", () => {
    const page = [
      "PORTARIA N.º 131/2026 - SEMCAS -",
      "COMISSÃO DE MONITORAMENTO 130",
      DOTS,
    ].join("\n");

    expect(parseIndex([page]).items).toEqual([
      {
        title: "PORTARIA N.º 131/2026 - SEMCAS - COMISSÃO DE MONITORAMENTO",
        page: 130,
      },
    ]);
  });

  it("keeps a title whose dots start on the next page", () => {
    const first = [
      "PORTARIA N.º 1 5",
      DOTS,
      "EXTRATO DO CONTRATO N.º 7/2026",
    ].join("\n");
    const second = ["6", DOTS].join("\n");

    expect(parseIndex([first, second]).items).toEqual([
      { title: "PORTARIA N.º 1", page: 5 },
      { title: "EXTRATO DO CONTRATO N.º 7/2026", page: 6 },
    ]);
  });

  it("stops at the first page without dots and counts the index pages", () => {
    const index = ["PORTARIA N.º 1 3", DOTS].join("\n");

    const result = parseIndex([index, index, "PORTARIA N.º 1\ntexto", index]);

    expect(result.pageCount).toBe(2);
    expect(result.items).toHaveLength(2);
  });

  it("reports an entry that has no page number instead of dropping it", () => {
    const page = [
      "PORTARIA SEM NUMERO DE PAGINA",
      DOTS,
      "DECRETO N.º 2 9",
      DOTS,
    ].join("\n");

    const result = parseIndex([page]);

    expect(result.unreadable).toEqual(["PORTARIA SEM NUMERO DE PAGINA"]);
    expect(result.items).toEqual([{ title: "DECRETO N.º 2", page: 9 }]);
  });

  it("finds no index in a page of plain text", () => {
    expect(parseIndex(["texto de um ato\nsem pontilhado"])).toEqual({
      items: [],
      pageCount: 0,
      unreadable: [],
    });
  });
});
