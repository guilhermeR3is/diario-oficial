import { CITATION } from "@/generation/parse-citations";

export type Claim = { text: string; citations: number[] };

type CitationGroup = { start: number; end: number; numbers: number[] };

function citationGroups(answer: string): CitationGroup[] {
  const groups: CitationGroup[] = [];
  for (const match of answer.matchAll(CITATION)) {
    const start = match.index;
    const end = start + match[0].length;
    const numbers = match[1].split(",").map(Number);
    const previous = groups.at(-1);
    // [1] [2] lado a lado sustentam a mesma afirmação
    if (previous && answer.slice(previous.end, start).trim() === "") {
      previous.end = end;
      previous.numbers.push(...numbers);
    } else {
      groups.push({ start, end, numbers });
    }
  }
  return groups;
}

// o prompt manda terminar cada afirmação com a fonte, então o texto até a citação é a afirmação; dividir por pontuação erraria em "M. A. SILVA" e "art. 5º"
export function splitClaims(answer: string): Claim[] {
  const claims: Claim[] = [];
  let cursor = 0;

  const push = (end: number, numbers: number[]) => {
    // a pontuação que vem depois de uma citação pertence à afirmação anterior
    const text = answer
      .slice(cursor, end)
      .replace(/^[\s.,;:]+/, "")
      .trim();
    if (!/[\p{L}\p{N}]/u.test(text)) return;
    const citations = [...new Set(numbers)].sort((a, b) => a - b);
    claims.push({ text, citations });
  };

  for (const group of citationGroups(answer)) {
    push(group.start, group.numbers);
    cursor = group.end;
  }
  push(answer.length, []);
  return claims;
}
