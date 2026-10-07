import { NOT_FOUND_ANSWER } from "./build-prompt";

export const CITATION = /\[\s*(\d+(?:\s*,\s*\d+)*)\s*\]/g;

const REFUSAL_START = NOT_FOUND_ANSWER.replace(/\.$/, "").toLowerCase();

export type ParsedCitations = { cited: number[]; invalid: number[] };

const ascending = (numbers: number[]) =>
  [...new Set(numbers)].sort((a, b) => a - b);

function citedNumbers(answer: string): number[] {
  return [...answer.matchAll(CITATION)].flatMap((match) =>
    match[1].split(",").map(Number),
  );
}

export function parseCitations(
  answer: string,
  sourceCount: number,
): ParsedCitations {
  const numbers = citedNumbers(answer);
  const exists = (n: number) => n >= 1 && n <= sourceCount;

  return {
    cited: ascending(numbers.filter(exists)),
    invalid: ascending(numbers.filter((n) => !exists(n))),
  };
}

// só vale como recusa se não cita nada; "não encontrei" com [1] é resposta parcial
export function isNotFound(answer: string): boolean {
  return (
    answer.trim().toLowerCase().startsWith(REFUSAL_START) &&
    citedNumbers(answer).length === 0
  );
}
