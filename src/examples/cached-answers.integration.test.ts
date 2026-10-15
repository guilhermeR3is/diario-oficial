import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { recordFeedback, recordQuery } from "@/generation/query-log";
import { startTestDatabase } from "@/test/database";
import { listExamples, loadExample } from "./cached-answers";

describe("cached answers and the query log", () => {
  let testDb: Awaited<ReturnType<typeof startTestDatabase>>;
  let db: typeof testDb.db;
  let editionId: number;

  const chunk = (ordinal: number, title: string) =>
    db.chunk.create({
      data: {
        editionId,
        ordinal,
        actType: "PORTARIA",
        title,
        secretariat: "SEMED",
        date: new Date("2026-08-14"),
        page: 3,
        pageEnd: 4,
        text: `texto de ${title}`,
        tokenCount: 5,
        contentHash: "hash",
      },
    });

  const cachedAnswer = (
    slug: string,
    position: number,
    citations: unknown,
    answer = "Saiu a portaria [2] e depois a [1].",
  ) =>
    db.cachedAnswer.create({
      data: {
        questionSlug: slug,
        question: `pergunta ${slug}?`,
        answer,
        citations: citations as object,
        model: "openai/gpt-oss-120b",
        promptVersion: "v2",
        position,
        generatedAt: new Date("2026-10-16T12:00:00Z"),
      },
    });

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
          title: "Diário Oficial - Edição nº 190",
          date: new Date("2026-08-14"),
          sourceUrl: "https://exemplo.test/190.pdf",
        },
      })
    ).id;
    // id e ordinal em ordens opostas: a fonte precisa sair pela chave estável, não pelo id
    await chunk(9, "PORTARIA N.º 9/2026");
    await chunk(4, "PORTARIA N.º 4/2026");
  }, 180_000);

  beforeEach(async () => {
    await db.cachedAnswer.deleteMany();
    await db.queryLog.deleteMany();
  });

  afterAll(async () => {
    await testDb.stop();
  });

  it("lists the example questions in their display order", async () => {
    await cachedAnswer("segunda", 2, []);
    await cachedAnswer("primeira", 1, []);

    expect(await listExamples(db)).toEqual([
      { slug: "primeira", question: "pergunta primeira?" },
      { slug: "segunda", question: "pergunta segunda?" },
    ]);
  });

  it("loads an example with its sources in the cited order, found by url and ordinal", async () => {
    const url = "https://exemplo.test/190.pdf";
    await cachedAnswer("portarias", 1, [
      { sourceUrl: url, ordinal: 4 },
      { sourceUrl: url, ordinal: 9 },
    ]);

    const example = await loadExample(db, "portarias");

    expect(example).toMatchObject({
      slug: "portarias",
      question: "pergunta portarias?",
      // em ordem crescente, como no evento done da resposta ao vivo
      citations: [1, 2],
      notFound: false,
      generatedAt: "2026-10-16T12:00:00.000Z",
    });
    expect(example?.sources.map((source) => source.title)).toEqual([
      "PORTARIA N.º 4/2026",
      "PORTARIA N.º 9/2026",
    ]);
    expect(example?.sources[0]).toMatchObject({
      ordinal: 4,
      date: "2026-08-14",
      page: 3,
      pageEnd: 4,
      edition: { title: "Diário Oficial - Edição nº 190", sourceUrl: url },
    });
  });

  it("returns null for an unknown example", async () => {
    expect(await loadExample(db, "nao-existe")).toBeNull();
  });

  it("fails loudly when a cited chunk no longer exists", async () => {
    await cachedAnswer("velha", 1, [
      { sourceUrl: "https://exemplo.test/190.pdf", ordinal: 77 },
    ]);

    await expect(loadExample(db, "velha")).rejects.toThrow(/missing chunk/);
  });

  it("refuses citations stored in another shape", async () => {
    await cachedAnswer("formato", 1, [{ chunkId: 1 }]);

    await expect(loadExample(db, "formato")).rejects.toThrow();
  });

  it("records a query and then its feedback, and changes it on a second click", async () => {
    const queryId = await recordQuery(db, {
      question: "quem foi nomeado?",
      searchMode: "text",
      retrievedChunkIds: [1, 2],
      answer: "Fulano [1].",
      model: "fake",
      promptVersion: "v2",
      latencyMs: 812,
    });

    expect(await recordFeedback(db, queryId, false)).toBe(true);
    expect(await recordFeedback(db, queryId, true)).toBe(true);

    const row = await db.queryLog.findUniqueOrThrow({ where: { id: queryId } });
    expect(row).toMatchObject({
      searchMode: "text",
      retrievedChunkIds: [1, 2],
      latencyMs: 812,
      feedback: "useful",
    });
  });

  it("reports an unknown query id instead of creating feedback out of nowhere", async () => {
    expect(
      await recordFeedback(db, "0b6f3a52-6a51-4c43-9d1e-5f4f0c3b7a10", true),
    ).toBe(false);
    expect(await db.queryLog.count()).toBe(0);
  });
});
