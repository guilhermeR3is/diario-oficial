import { EXPECTED_COUNTS } from "./check-questions";

export const QUESTION_SETS = {
  // as 40 do plano, sobre fatos de jul–set/2026
  main: { file: "eval/questions.jsonl", expected: EXPECTED_COUNTS },
  // escritas depois da ampliação para jan–set e congeladas antes de qualquer ajuste: só medem, nunca orientam a busca
  "jan-jun": {
    file: "eval/questions-jan-jun.jsonl",
    expected: { total: 16, unanswerable: 2 },
  },
} as const;

export type QuestionSetName = keyof typeof QUESTION_SETS;

export function parseQuestionSet(args: string[]): QuestionSetName {
  const arg = args.find((value) => value.startsWith("--set="));
  if (arg === undefined) return "main";
  const value = arg.slice("--set=".length);
  if (!Object.hasOwn(QUESTION_SETS, value)) {
    throw new Error(
      `--set deve ser um de: ${Object.keys(QUESTION_SETS).join(", ")} (recebi "${value}")`,
    );
  }
  return value as QuestionSetName;
}
