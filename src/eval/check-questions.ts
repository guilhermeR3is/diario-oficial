import type { ChunkKey, EvalQuestion } from "./questions";

export type IndexedChunk = {
  sourceUrl: string;
  ordinal: number;
  page: number;
  title: string;
  editionTitle: string;
  text: string;
};

// o plano pede 40 perguntas, 5 delas sem resposta nos diários
export const EXPECTED_COUNTS = { total: 40, unanswerable: 5 };

const squash = (text: string) => text.replace(/\s+/g, " ").trim();
const keyOf = ({ sourceUrl, ordinal }: ChunkKey) => `${sourceUrl}#${ordinal}`;

export function checkQuestions(
  questions: EvalQuestion[],
  chunks: IndexedChunk[],
  expected = EXPECTED_COUNTS,
): string[] {
  const problems: string[] = [];
  const squashed = chunks.map((chunk) => ({
    key: keyOf(chunk),
    text: squash(chunk.text),
  }));
  const known = new Set(squashed.map((chunk) => chunk.key));
  const containing = (phrase: string) =>
    squashed
      .filter((chunk) => chunk.text.includes(squash(phrase)))
      .map((chunk) => chunk.key);

  const unanswerable = questions.filter(
    (q) => q.kind === "unanswerable",
  ).length;
  if (questions.length !== expected.total) {
    problems.push(
      `esperadas ${expected.total} perguntas, há ${questions.length}`,
    );
  }
  if (unanswerable !== expected.unanswerable) {
    problems.push(
      `esperadas ${expected.unanswerable} perguntas sem resposta, há ${unanswerable}`,
    );
  }

  const seenIds = new Set<string>();
  const seenTexts = new Set<string>();
  for (const question of questions) {
    if (seenIds.has(question.id)) problems.push(`${question.id}: id repetido`);
    if (seenTexts.has(squash(question.question)))
      problems.push(`${question.id}: pergunta repetida`);
    seenIds.add(question.id);
    seenTexts.add(squash(question.question));

    for (const phrase of question.absent) {
      const found = containing(phrase);
      if (found.length > 0) {
        problems.push(
          `${question.id}: o termo "${phrase}" deveria estar ausente, mas aparece em ${found.length} trecho(s)`,
        );
      }
    }
    if (question.kind === "unanswerable") continue;

    const declared = new Set(question.relevant.map(keyOf));
    const holders = new Set<string>();
    for (const phrase of question.evidence) {
      const found = containing(phrase);
      if (found.length === 0)
        problems.push(
          `${question.id}: a evidência "${phrase}" não está em nenhum trecho`,
        );
      found.forEach((key) => holders.add(key));
    }

    for (const key of declared) {
      if (!known.has(key))
        problems.push(`${question.id}: o trecho ${key} não existe no banco`);
      else if (!holders.has(key))
        problems.push(
          `${question.id}: o trecho ${key} está no gabarito, mas não contém nenhuma evidência`,
        );
    }
    for (const key of holders) {
      if (!declared.has(key))
        problems.push(
          `${question.id}: o trecho ${key} contém a evidência e falta no gabarito`,
        );
    }
  }

  return problems;
}
