import "dotenv/config";
import { readFile } from "node:fs/promises";
import { loadEmbedder } from "@/embedding/gte-embedder";
import { db } from "@/lib/db";
import { searchChunks } from "@/search/search-chunks";
import { searchHybrid } from "@/search/search-hybrid";
import { searchText } from "@/search/search-text";
import { assertAllChunksHaveTheModelVector } from "./assert-chunk-vectors";
import { QUESTION_SETS, parseQuestionSet } from "./question-sets";
import { parseQuestions } from "./questions";
import { formatReport } from "./report";
import { SEARCH_LIMIT, runRetrieval } from "./run-retrieval";
import { parseSubset, selectSubset } from "./subset";

async function main() {
  const args = process.argv.slice(2);
  const subset = parseSubset(args);
  const setName = parseQuestionSet(args);
  const questions = selectSubset(
    parseQuestions(await readFile(QUESTION_SETS[setName].file, "utf8")),
    subset,
  );
  await assertAllChunksHaveTheModelVector(db);

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

  process.stdout.write(
    `Perguntas: ${setName}; subconjunto: ${subset}\n\n${formatReport(run)}`,
  );
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
