import "dotenv/config";
import { readFile } from "node:fs/promises";
import { EMBEDDING_MODEL } from "@/embedding/model";
import { loadEmbedder } from "@/embedding/gte-embedder";
import { db } from "@/lib/db";
import { searchChunks } from "@/search/search-chunks";
import { searchHybrid } from "@/search/search-hybrid";
import { searchText } from "@/search/search-text";
import { parseQuestions } from "./questions";
import { formatReport } from "./report";
import { SEARCH_LIMIT, runRetrieval } from "./run-retrieval";

async function assertAllChunksHaveTheModelVector() {
  const [row] = await db.$queryRaw<{ missing: number }[]>`
    SELECT count(*)::int AS missing FROM chunk
    WHERE embedding IS NULL OR embedding_model IS DISTINCT FROM ${EMBEDDING_MODEL}`;
  if (row!.missing > 0) {
    throw new Error(
      `${row!.missing} trechos sem o vetor de ${EMBEDDING_MODEL}: rode pnpm embed antes`,
    );
  }
}

async function main() {
  const questions = parseQuestions(
    await readFile("eval/questions.jsonl", "utf8"),
  );
  await assertAllChunksHaveTheModelVector();

  const embed = await loadEmbedder();
  const vectors = new Map<string, number[]>();
  const vectorOf = async ({
    id,
    question,
  }: {
    id: string;
    question: string;
  }) => {
    if (!vectors.has(id)) vectors.set(id, await embed(question));
    return vectors.get(id)!;
  };

  const run = await runRetrieval(questions, {
    vector: async (q) => searchChunks(db, await vectorOf(q), SEARCH_LIMIT),
    text: (q) => searchText(db, q.question, SEARCH_LIMIT),
    hybrid: async (q) =>
      searchHybrid(
        db,
        { question: q.question, vector: await vectorOf(q) },
        SEARCH_LIMIT,
      ),
  });

  process.stdout.write(formatReport(run));
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
