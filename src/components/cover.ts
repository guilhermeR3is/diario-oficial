import type { CSSProperties } from "react";

export const COVER_COUNT = 6;

// a cor de capa identifica a fonte n em todo lugar (resposta, aba e trecho); sempre ao lado do número
export function coverStyle(n: number): CSSProperties {
  const index = ((n - 1) % COVER_COUNT) + 1;
  return {
    "--cover": `var(--cover-${index})`,
    "--cover-ink": `var(--cover-${index}-ink)`,
  } as CSSProperties;
}
