import { describe, expect, it } from "vitest";
import { segmentEdition } from "./segment-edition";
import { loadFixtures } from "./test-fixtures";

const DOTS = ".".repeat(60);

const lines = (...parts: string[]) => parts.join("\n");

const signed = (n: number) =>
  lines(
    "Publicado por: Fulano",
    `Código identificador: 0000000${n}-aaaa-bbbb-cccc-dddddddddddd`,
  );

function footer(page: number, total: number) {
  return lines(
    "SÃO LUÍS/MA * QUARTA * 02 DE SETEMBRO DE 2026 ANO XLVI * N.º 208 * ISSN 2764-8958",
    "Este documento pode ser verificado no endereço eletrônico",
    `https://diariooficial.saoluis.ma.gov.br ${page} / ${total}`,
    "Documento assinado com certificado digital e carimbo de tempo,",
    "conforme Instrução Normativa N.º 70/2021 do TCE/MA.",
  );
}

function edition(...bodies: string[]) {
  return bodies.map((body, i) => `${body}\n${footer(i + 1, bodies.length)}\n`);
}

function index(...items: [string, number][]) {
  return items.map(([title, page]) => `${title} ${page}\n${DOTS}`).join("\n");
}

describe("segmentEdition", () => {
  it("cuts the acts at the index titles and names the section of each", () => {
    const pages = edition(
      index(
        ["ÍNDICE - PREFEITURA MUNICIPAL DE SÃO LUÍS", 2],
        ["SECRETARIA MUNICIPAL DE SAÚDE - SEMUS", 2],
        ["PORTARIA N.º 1/2026", 2],
        ["SECRETARIA MUNICIPAL DE EDUCAÇÃO - SEMED", 2],
        ["EXTRATO DO CONTRATO N.º 7/2026", 2],
      ),
      lines(
        "PREFEITURA MUNICIPAL DE SÃO LUÍS",
        "SECRETARIA MUNICIPAL DE SAÚDE - SEMUS",
        "PORTARIA N.º 1/2026",
        "Texto da portaria.",
        signed(1),
        "SECRETARIA MUNICIPAL DE EDUCAÇÃO - SEMED",
        "EXTRATO DO CONTRATO N.º 7/2026",
        "Texto do extrato.",
        signed(2),
      ),
    );

    expect(segmentEdition(pages)).toEqual({
      acts: [
        {
          title: "PORTARIA N.º 1/2026",
          section: "SECRETARIA MUNICIPAL DE SAÚDE - SEMUS",
          parts: [
            {
              page: 2,
              text: lines(
                "PORTARIA N.º 1/2026",
                "Texto da portaria.",
                signed(1),
              ),
            },
          ],
        },
        {
          title: "EXTRATO DO CONTRATO N.º 7/2026",
          section: "SECRETARIA MUNICIPAL DE EDUCAÇÃO - SEMED",
          parts: [
            {
              page: 2,
              text: lines(
                "EXTRATO DO CONTRATO N.º 7/2026",
                "Texto do extrato.",
                signed(2),
              ),
            },
          ],
        },
      ],
      problems: [],
    });
  });

  it("keeps one part per page when an act crosses pages", () => {
    const pages = edition(
      index(
        ["SECRETARIA MUNICIPAL DE SAÚDE - SEMUS", 2],
        ["EXTRATO DO CONTRATO N.º 7/2026", 2],
      ),
      lines(
        "SECRETARIA MUNICIPAL DE SAÚDE - SEMUS",
        "EXTRATO DO CONTRATO N.º 7/2026",
        "primeira parte",
      ),
      lines("segunda parte", signed(1)),
    );

    expect(segmentEdition(pages).acts[0]!.parts).toEqual([
      { page: 2, text: "EXTRATO DO CONTRATO N.º 7/2026\nprimeira parte" },
      { page: 3, text: lines("segunda parte", signed(1)) },
    ]);
  });

  it("finds a title that the page breaks over two lines", () => {
    const pages = edition(
      index(["EXTRATO DO CONTRATO N.º 7/2026", 2]),
      lines("EXTRATO DO CONTRATO", "N.º 7/2026", "texto", signed(1)),
    );

    const { acts, problems } = segmentEdition(pages);

    expect(acts.map((act) => act.title)).toEqual([
      "EXTRATO DO CONTRATO N.º 7/2026",
    ]);
    expect(problems).toEqual([]);
  });

  it("matches titles with regular-expression characters literally", () => {
    const title = "PORTARIA N.º 1.943 (REPUBLICADA) [A+B]";
    const pages = edition(index([title, 2]), lines(title, "texto", signed(1)));

    expect(segmentEdition(pages).acts.map((act) => act.title)).toEqual([title]);
  });

  it("finds a repeated title at its own position", () => {
    const pages = edition(
      index(
        ["SECRETARIA MUNICIPAL DE SAÚDE - SEMUS", 2],
        ["EXTRATO N.º 1", 2],
        ["EXTRATO N.º 1", 2],
      ),
      lines(
        "SECRETARIA MUNICIPAL DE SAÚDE - SEMUS",
        "EXTRATO N.º 1",
        "primeiro",
        signed(1),
        "EXTRATO N.º 1",
        "segundo",
        signed(2),
      ),
    );

    const { acts, problems } = segmentEdition(pages);

    expect(problems).toEqual([]);
    expect(acts.map((act) => act.parts[0]!.text)).toEqual([
      lines("EXTRATO N.º 1", "primeiro", signed(1)),
      lines("EXTRATO N.º 1", "segundo", signed(2)),
    ]);
  });

  it("does not take a heading quoted inside the text of another act", () => {
    const pages = edition(
      index(
        ["SECRETARIA MUNICIPAL DE ADMINISTRAÇÃO - SEMAD", 2],
        ["PORTARIA SEMAD N.º 3.037", 2],
        ["SECRETARIA MUNICIPAL DE SAÚDE - SEMUS", 2],
        ["COMUNICAÇÃO - PROCESSO N.º 1", 2],
      ),
      lines(
        "SECRETARIA MUNICIPAL DE ADMINISTRAÇÃO - SEMAD",
        "PORTARIA SEMAD N.º 3.037",
        "lotada na",
        "SECRETARIA MUNICIPAL DE SAÚDE - SEMUS, após cumprimento dos trâmites",
        signed(1),
        "SECRETARIA MUNICIPAL DE SAÚDE - SEMUS",
        "COMUNICAÇÃO - PROCESSO N.º 1",
        "texto",
        signed(2),
      ),
    );

    const { acts, problems } = segmentEdition(pages);

    expect(problems).toEqual([]);
    expect(acts.map((act) => [act.title, act.section])).toEqual([
      [
        "PORTARIA SEMAD N.º 3.037",
        "SECRETARIA MUNICIPAL DE ADMINISTRAÇÃO - SEMAD",
      ],
      ["COMUNICAÇÃO - PROCESSO N.º 1", "SECRETARIA MUNICIPAL DE SAÚDE - SEMUS"],
    ]);
    expect(acts[0]!.parts[0]!.text).toContain("SEMUS, após cumprimento");
  });

  it("accepts a heading and an act title on the same line", () => {
    const pages = edition(
      index(
        ["SECRETARIA MUNICIPAL DA FAZENDA - SEMFAZ", 2],
        ["ACÓRDÃO Nº 25/2026", 2],
      ),
      lines(
        "SECRETARIA MUNICIPAL DA FAZENDA - SEMFAZ ACÓRDÃO Nº 25/2026",
        "PROCESSO: SEI 1",
        signed(1),
      ),
    );

    const { acts, problems } = segmentEdition(pages);

    expect(problems).toEqual([]);
    expect(acts.map((act) => [act.title, act.section])).toEqual([
      ["ACÓRDÃO Nº 25/2026", "SECRETARIA MUNICIPAL DA FAZENDA - SEMFAZ"],
    ]);
  });

  it("reports a title missing from the text and still cuts the others", () => {
    const pages = edition(
      index(
        ["PORTARIA N.º 1/2026", 2],
        ["DECRETO N.º 9", 2],
        ["EXTRATO DO CONTRATO N.º 7/2026", 2],
      ),
      lines(
        "PORTARIA N.º 1/2026",
        "texto",
        signed(1),
        "EXTRATO DO CONTRATO N.º 7/2026",
        "texto",
        signed(2),
      ),
    );

    const { acts, problems } = segmentEdition(pages);

    expect(problems).toEqual([
      { kind: "title-not-found", title: "DECRETO N.º 9", page: 2 },
    ]);
    expect(acts.map((act) => act.title)).toEqual([
      "PORTARIA N.º 1/2026",
      "EXTRATO DO CONTRATO N.º 7/2026",
    ]);
  });

  it("accepts the declared page off by one but not by two", () => {
    const body = lines("PORTARIA N.º 1/2026", "texto", signed(1));
    const withDeclaredPage = (page: number) =>
      segmentEdition(
        edition(index(["PORTARIA N.º 1/2026", page]), body, "outra página"),
      );

    expect(withDeclaredPage(3).problems).toEqual([]);
    expect(withDeclaredPage(4).problems).toEqual([
      { kind: "title-not-found", title: "PORTARIA N.º 1/2026", page: 4 },
    ]);
  });

  it("keeps an act that has no identifier code and reports it", () => {
    const pages = edition(
      index(["PORTARIA N.º 1/2026", 2], ["EXTRATO DO CONTRATO N.º 7/2026", 2]),
      lines(
        "PORTARIA N.º 1/2026",
        "texto sem código",
        "EXTRATO DO CONTRATO N.º 7/2026",
        "texto",
        signed(2),
      ),
    );

    const { acts, problems } = segmentEdition(pages);

    expect(acts).toHaveLength(2);
    expect(problems).toEqual([
      { kind: "missing-code", title: "PORTARIA N.º 1/2026", page: 2 },
    ]);
  });

  it("reports an act that holds two identifier codes", () => {
    const pages = edition(
      index(["PORTARIA N.º 1/2026", 2]),
      lines("PORTARIA N.º 1/2026", "texto", signed(1), "outro ato", signed(2)),
    );

    expect(segmentEdition(pages).problems).toEqual([
      { kind: "extra-codes", title: "PORTARIA N.º 1/2026", page: 2 },
    ]);
  });

  it("reports an index entry that has no page number", () => {
    const pages = edition(
      `PORTARIA SEM PAGINA\n${DOTS}\n${index(["PORTARIA N.º 1/2026", 2])}`,
      lines("PORTARIA N.º 1/2026", "texto", signed(1)),
    );

    const { acts, problems } = segmentEdition(pages);

    expect(acts).toHaveLength(1);
    expect(problems).toEqual([
      { kind: "unreadable-index-entry", title: "PORTARIA SEM PAGINA", page: 0 },
    ]);
  });

  it("reports an edition without an index", () => {
    expect(segmentEdition(edition("só texto", "mais texto"))).toEqual({
      acts: [],
      problems: [{ kind: "no-index", title: "", page: 1 }],
    });
  });

  it("drops the edition credits from the last act", () => {
    const pages = edition(
      index(["PORTARIA N.º 1/2026", 2]),
      lines("PORTARIA N.º 1/2026", "texto", signed(1)),
      lines(
        "EXPEDIENTE",
        "PREFEITURA DE SÃO LUÍS",
        "Imprensa Oficial do Município",
      ),
    );

    const { acts } = segmentEdition(pages);

    expect(acts[0]!.parts).toEqual([
      { page: 2, text: lines("PORTARIA N.º 1/2026", "texto", signed(1)) },
    ]);
  });

  it("throws when a page has no footer, so a layout change is not hidden", () => {
    expect(() => segmentEdition(["texto sem rodapé"])).toThrow(/footer/);
  });
});

const EXPECTED_FIXTURES: Record<string, { acts: number; problems: string[] }> =
  {
    "edition-157.json": { acts: 94, problems: ["title-not-found"] },
    "edition-160.json": { acts: 1, problems: [] },
    "edition-162.json": { acts: 77, problems: ["title-not-found"] },
    "edition-165.json": { acts: 2, problems: [] },
    "edition-190.json": { acts: 1, problems: [] },
    "edition-196.json": { acts: 89, problems: [] },
    "edition-201.json": { acts: 89, problems: [] },
    "edition-206.json": { acts: 79, problems: [] },
    "edition-209.json": { acts: 18, problems: [] },
    "edition-225.json": { acts: 41, problems: [] },
  };

describe.each(loadFixtures())("segmentEdition on $file", (fixture) => {
  const { acts, problems } = segmentEdition(fixture.pages);
  const expected = EXPECTED_FIXTURES[fixture.file]!;

  it("finds the known acts and only the known problems", () => {
    expect(acts).toHaveLength(expected.acts);
    expect(problems.map((problem) => problem.kind)).toEqual(expected.problems);
  });

  it("gives every act a section and at least one page", () => {
    for (const act of acts) {
      expect(act.section).not.toBeNull();
      expect(act.parts.length).toBeGreaterThan(0);
    }
  });

  it("ends the last act at its identifier code, with no edition credits after it", () => {
    const text = acts
      .at(-1)!
      .parts.map((part) => part.text)
      .join("\n");

    expect(text).toMatch(/Código identificador: [0-9a-f-]{36}$/);
  });

  it.runIf(expected.problems.length === 0)(
    "ends every act at its own identifier code",
    () => {
      for (const act of acts) {
        const text = act.parts.map((part) => part.text).join("\n");
        expect(text).toMatch(/Código identificador: [0-9a-f-]{36}$/);
        expect(text.match(/Código identificador:/g)).toHaveLength(1);
      }
    },
  );
});

describe("segmentEdition on the single long edital", () => {
  const fixture = loadFixtures().find((f) => f.file === "edition-160.json")!;

  it("keeps one act across every page between the index and the credits", () => {
    const [act] = segmentEdition(fixture.pages).acts;

    expect(act!.parts).toHaveLength(76);
    expect(act!.parts[0]!.page).toBe(2);
    expect(act!.parts.at(-1)!.page).toBe(77);
  });
});
