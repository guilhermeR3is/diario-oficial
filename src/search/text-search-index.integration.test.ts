import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestDatabase } from "@/test/database";

describe("chunk text search column", () => {
  let testDb: Awaited<ReturnType<typeof startTestDatabase>>;
  let db: typeof testDb.db;
  let editionId: number;
  let ordinal: number;

  const createChunk = (text: string) =>
    db.chunk.create({
      data: {
        editionId,
        ordinal: ordinal++,
        actType: "PORTARIA",
        title: "PORTARIA",
        date: new Date("2026-09-30"),
        page: 4,
        pageEnd: 4,
        text,
        tokenCount: 6,
        contentHash: "hash-da-edicao",
      },
    });

  const normalize = async (input: string | null) => {
    const [row] = await db.$queryRaw<{ out: string | null }[]>`
      SELECT normalize_act_numbers(${input}) AS out`;
    return row!.out;
  };

  const textsMatching = async (question: string) => {
    const rows = await db.$queryRaw<{ text: string }[]>`
      SELECT text FROM chunk
      WHERE tsv @@ plainto_tsquery('portuguese', normalize_act_numbers(${question}))
      ORDER BY id`;
    return rows.map((row) => row.text);
  };

  beforeAll(async () => {
    testDb = await startTestDatabase();
    db = testDb.db;
    const territory = await db.territory.create({
      data: { ibgeCode: "2111300", name: "São Luís", uf: "MA" },
    });
    editionId = (
      await db.edition.create({
        data: {
          territoryId: territory.id,
          title: "Diário Oficial - Edição nº 230/XLVI",
          date: new Date("2026-09-30"),
          sourceUrl: "https://exemplo.test/230.pdf",
        },
      })
    ).id;
  }, 180_000);

  beforeEach(async () => {
    await db.chunk.deleteMany();
    ordinal = 0;
  });

  afterAll(async () => {
    await testDb?.stop();
  });

  describe("normalize_act_numbers", () => {
    it.each([
      ["PORTARIA Nº 1.746/2026", "PORTARIA 1746.2026"],
      ["PORTARIA N.º 1.746/2026", "PORTARIA 1746.2026"],
      ["PORTARIA N° 1746/2026", "PORTARIA 1746.2026"],
      ["PORTARIA N.º 001/2026-GAB/SEMAD", "PORTARIA 1.2026-GAB/SEMAD"],
      ["PROCESSO N.º 13101.004950/2026", "PROCESSO 13101004950.2026"],
      [
        "PORTARIA N.º 24, DE 21 DE JULHO DE 2026",
        "PORTARIA 24, DE 21 DE JULHO DE 2026",
      ],
    ])("turns %j into %j", async (input, expected) => {
      expect(await normalize(input)).toBe(expected);
    });

    it("leaves text without act numbers untouched", async () => {
      const text =
        "Seção N. do regimento, prazo de 10.000 dias e valor R$ 1.234,56";

      expect(await normalize(text)).toBe(text);
    });

    it("returns null for null", async () => {
      expect(await normalize(null)).toBeNull();
    });
  });

  describe("tsv trigger", () => {
    const hasTsv = async (id: number) => {
      const [row] = await db.$queryRaw<{ filled: boolean }[]>`
        SELECT tsv IS NOT NULL AS filled FROM chunk WHERE id = ${id}`;
      return row!.filled;
    };

    it("fills the column on insert, including createMany", async () => {
      const single = await createChunk("licitação de merenda escolar");
      await db.chunk.createMany({
        data: [
          {
            editionId,
            ordinal: 90,
            actType: "ATA",
            title: "ATA",
            date: new Date("2026-09-30"),
            page: 1,
            pageEnd: 1,
            text: "ata de registro de preços",
            tokenCount: 6,
            contentHash: "hash-da-edicao",
          },
        ],
      });

      expect(await hasTsv(single.id)).toBe(true);
      expect(await textsMatching("registro de preços")).toEqual([
        "ata de registro de preços",
      ]);
    });

    it("fills the column when the search_path is empty, as in a pg_restore", async () => {
      const filled = await db.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL search_path = ''`;
        await tx.$executeRaw`
          INSERT INTO public.chunk (edition_id, ordinal, act_type, title, date, page, page_end, text, token_count, content_hash)
          VALUES (${editionId}, 0, 'PORTARIA', 'PORTARIA', '2026-09-30', 1, 1, 'PORTARIA Nº 1.286/2026', 6, 'hash-da-edicao')`;
        return tx.$queryRaw<{ filled: boolean }[]>`
          SELECT tsv IS NOT NULL AS filled FROM public.chunk`;
      });

      expect(filled).toEqual([{ filled: true }]);
    });

    it("refreshes the column when the text changes", async () => {
      const { id } = await createChunk("licitação de merenda escolar");

      await db.chunk.update({
        where: { id },
        data: { text: "nomeação de professor" },
      });

      expect(await textsMatching("merenda")).toEqual([]);
      expect(await textsMatching("professor")).toEqual([
        "nomeação de professor",
      ]);
    });
  });

  describe("search by act number", () => {
    const written = {
      thousands:
        "PORTARIA N.º 1.286/2026 - SEMUS\nO secretário resolve nomear.",
      leadingZeros:
        "PORTARIA Nº 001/2026-GAB/SEMAD\nO secretário resolve exonerar.",
      neighbor:
        "PORTARIA N.º 1.287/2026 - SEMED\nO secretário resolve designar.",
      process: "EXTRATO DO PROCESSO N.º 13101.004950/2026 da SEMCAS",
    };

    beforeEach(async () => {
      for (const text of Object.values(written)) await createChunk(text);
    });

    it.each([
      ["Portaria nº 1.286/2026", "thousands"],
      ["portaria 1286/2026", "thousands"],
      ["Portaria N.º 1286/2026", "thousands"],
      ["portaria 1/2026", "leadingZeros"],
      ["processo 13101004950/2026", "process"],
      ["processo nº 13101.004950/2026", "process"],
    ] as const)("finds %j", async (question, key) => {
      expect(await textsMatching(question)).toEqual([written[key]]);
    });

    it("finds nothing for a number that is not in any act", async () => {
      expect(await textsMatching("portaria 1288/2026")).toEqual([]);
    });

    it("answers through the GIN index", async () => {
      const plan = await db.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL enable_seqscan = off`;
        return tx.$queryRaw<{ "QUERY PLAN": string }[]>`
          EXPLAIN SELECT id FROM chunk
          WHERE tsv @@ plainto_tsquery('portuguese', normalize_act_numbers('portaria 1286/2026'))`;
      });

      expect(plan.map((line) => line["QUERY PLAN"]).join("\n")).toContain(
        "chunk_tsv_idx",
      );
    });
  });
});
