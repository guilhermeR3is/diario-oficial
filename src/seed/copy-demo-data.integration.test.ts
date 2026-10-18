import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadExample } from "@/examples/cached-answers";
import { startTestDatabase } from "@/test/database";
import {
  copyDemoData,
  DEMO_TABLES,
  tableFingerprint,
  type DemoTable,
} from "./copy-demo-data";

type TestDatabase = Awaited<ReturnType<typeof startTestDatabase>>;
type Db = TestDatabase["db"];

// decimais longos de propósito: o vetor precisa voltar idêntico, não arredondado
const vectorLiteral = (seed: number) =>
  `[${Array.from({ length: 768 }, (_, i) => Math.sin(seed * 1000 + i) / 7).join(",")}]`;

async function createCorpus(db: Db, label: string) {
  const territory = await db.territory.create({
    data: { ibgeCode: `ibge-${label}`, name: `Cidade ${label}`, uf: "MA" },
  });
  const edition = (number: number, chunkProblems: object) =>
    db.edition.create({
      data: {
        territoryId: territory.id,
        title: `Diário Oficial - Edição nº ${number} (${label})`,
        date: new Date("2026-08-14"),
        sourceUrl: `https://exemplo.test/${label}/${number}.pdf`,
        contentHash: `hash-${label}-${number}`,
        pageCount: 12,
        status: "PROCESSED",
        chunkProblems,
      },
    });
  const editions = [
    await edition(190, []),
    await edition(191, [{ kind: "missing-title", title: "PORTARIA" }]),
  ];

  const chunks = [];
  for (const [index, text] of [
    "PORTARIA Nº 1.286/2026 nomeia servidora da SEMED",
    "Extrato do contrato de merenda escolar com a agricultura familiar",
    "Edital do concurso do hospital municipal",
    "Lei que cria o trocador de bebê nos banheiros públicos",
  ].entries()) {
    const chunk = await db.chunk.create({
      data: {
        editionId: editions[index % 2]!.id,
        ordinal: index,
        actType: "PORTARIA",
        title: `Ato ${index} ${label}`,
        secretariat: index === 3 ? null : "SEMED",
        date: new Date("2026-08-14"),
        page: index + 1,
        pageEnd: index + 2,
        text: `${text} (${label})`,
        tokenCount: 12,
        contentHash: `hash-${label}`,
      },
    });
    await db.$executeRaw`UPDATE chunk SET embedding = ${vectorLiteral(index)}::vector, embedding_model = 'modelo-de-teste' WHERE id = ${chunk.id}`;
    chunks.push(chunk);
  }
  // um buraco nos ids, como o de um banco real que já apagou trechos
  await db.chunk.delete({ where: { id: chunks[1]!.id } });

  await db.cachedAnswer.create({
    data: {
      questionSlug: `exemplo-${label}`,
      question: `Pergunta de exemplo ${label}?`,
      answer: "A portaria nomeou a servidora [1] e a lei criou o trocador [2].",
      citations: [
        { sourceUrl: editions[0]!.sourceUrl, ordinal: 0 },
        { sourceUrl: editions[1]!.sourceUrl, ordinal: 3 },
      ],
      model: "openai/gpt-oss-120b",
      promptVersion: "v2",
      position: 1,
      generatedAt: new Date("2026-10-16T12:00:00Z"),
    },
  });
}

const fingerprints = (db: Db) =>
  Promise.all(DEMO_TABLES.map((table) => tableFingerprint(db, table)));

const vectorsAndTsv = (db: Db) =>
  db.$queryRaw<{ id: number; embedding: string; tsv: string }[]>`
    SELECT id, embedding::text AS embedding, tsv::text AS tsv FROM chunk ORDER BY id`;

describe("copyDemoData", () => {
  let source: TestDatabase;
  let target: TestDatabase;

  beforeAll(async () => {
    [source, target] = await Promise.all([
      startTestDatabase(),
      startTestDatabase(),
    ]);
    await createCorpus(source.db, "origem");
    await createCorpus(target.db, "antigo");
    await target.db.queryLog.create({
      data: {
        question: "pergunta de um visitante",
        searchMode: "hybrid",
        retrievedChunkIds: [1, 2],
        answer: "resposta",
        model: "openai/gpt-oss-120b",
        promptVersion: "v2",
        latencyMs: 1200,
      },
    });
    await target.db
      .$executeRaw`INSERT INTO live_usage (day, key, count) VALUES ('2026-10-18', 'site', 3)`;
  }, 180_000);

  afterAll(async () => {
    await Promise.all([source?.stop(), target?.stop()]);
  });

  it("replaces the demo tables with the source rows, ids, vectors and text included, in small batches", async () => {
    const progress: [DemoTable, number, number][] = [];

    const copies = await copyDemoData(
      source.db,
      target.db,
      (table, copied, total) => progress.push([table, copied, total]),
      2,
    );

    expect(copies).toEqual([
      { table: "territory", rows: 1 },
      { table: "edition", rows: 2 },
      { table: "chunk", rows: 3 },
      { table: "cached_answer", rows: 1 },
    ]);
    expect(progress).toContainEqual(["chunk", 2, 3]);
    expect(progress).toContainEqual(["chunk", 3, 3]);
    expect(await fingerprints(target.db)).toEqual(
      await fingerprints(source.db),
    );
    const copied = await vectorsAndTsv(target.db);
    expect(copied).toEqual(await vectorsAndTsv(source.db));
    expect(copied.map((chunk) => chunk.id)).toEqual([1, 3, 4]);
    expect(copied[0]!.tsv).toContain("'1286.2026'");
    expect(
      await target.db.territory.count({ where: { name: "Cidade antigo" } }),
    ).toBe(0);
  });

  it("leaves the query log and the daily usage counters alone", async () => {
    expect(await target.db.queryLog.count()).toBe(1);
    expect(await target.db.liveUsage.count()).toBe(1);
  });

  it("lets the target create new rows after the copied ids", async () => {
    const territory = await target.db.territory.create({
      data: { ibgeCode: "novo", name: "Nova", uf: "MA" },
    });

    expect(territory.id).toBe(2);
    await target.db.territory.delete({ where: { id: territory.id } });
  });

  it("serves the copied examples with their cited chunks", async () => {
    const example = await loadExample(target.db, "exemplo-origem");

    expect(example?.sources.map((hit) => hit.title)).toEqual([
      "Ato 0 origem",
      "Ato 3 origem",
    ]);
  });

  it("gives the same result when it runs again", async () => {
    await copyDemoData(source.db, target.db);

    expect(await fingerprints(target.db)).toEqual(
      await fingerprints(source.db),
    );
  });

  it("writes nothing when the copied rows do not match the source", async () => {
    await target.db.$executeRaw`DELETE FROM cached_answer`;
    const before = await fingerprints(target.db);
    const [{ definition }] = await target.db.$queryRaw<
      { definition: string }[]
    >`SELECT pg_get_functiondef('public.chunk_fill_tsv'::regproc) AS definition`;
    await target.db.$executeRawUnsafe(
      definition.replace("'portuguese'", "'simple'"),
    );

    try {
      await expect(copyDemoData(source.db, target.db)).rejects.toThrow(
        /^chunk: o destino ficou diferente/,
      );
      expect(await fingerprints(target.db)).toEqual(before);
    } finally {
      await target.db.$executeRawUnsafe(definition);
    }
  });
});
