import type { EvalQuestion } from "./questions";

export const SUBSETS = ["all", "odd", "even"] as const;
export type Subset = (typeof SUBSETS)[number];

// ímpares servem para ajustar a busca e pares para o resultado final: ajustar e medir no mesmo conjunto contamina a medida
export function selectSubset(
  questions: EvalQuestion[],
  subset: Subset,
): EvalQuestion[] {
  if (subset === "all") return questions;
  const remainder = subset === "odd" ? 1 : 0;
  return questions.filter(
    (question) => Number(question.id.slice(1)) % 2 === remainder,
  );
}

export function parseSubset(args: string[]): Subset {
  const arg = args.find((value) => value.startsWith("--subset="));
  if (arg === undefined) return "all";
  const value = arg.slice("--subset=".length);
  if (!(SUBSETS as readonly string[]).includes(value)) {
    throw new Error(
      `--subset deve ser um de: ${SUBSETS.join(", ")} (recebi "${value}")`,
    );
  }
  return value as Subset;
}
