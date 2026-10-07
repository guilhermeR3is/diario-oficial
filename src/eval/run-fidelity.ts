import type { AnswerModel } from "@/generation/answer-model";
import { logger } from "@/lib/logger";
import {
  latestFidelity,
  type ClaimVerdict,
  type FidelityResult,
} from "./fidelity-result";
import {
  FIDELITY_PROMPT_VERSION,
  buildFidelityPrompt,
  type CheckedClaim,
  type FidelitySource,
} from "./fidelity-prompt";
import type { GenerationResult } from "./generation-result";
import { keyOf } from "./metrics";
import { parseVerdicts, type Verdict } from "./parse-verdicts";
import type { ChunkKey } from "./questions";
import { splitClaims } from "./split-claims";

// entrada medida nas 24 respostas reais (média de 1,5 mil tokens) mais ~500 de saída e raciocínio do verificador, estimados
export const TOKENS_PER_CHECK = 2_000;

const NO_SOURCE_REASON = "sem citação válida";

// uma segunda tentativa cobre o JSON malformado, que é o erro comum de quem devolve texto livre
const ATTEMPTS = 2;

export type FidelityDeps = {
  verifier: AnswerModel;
  textOf: (key: ChunkKey) => string | undefined;
};

export function pendingFidelity(
  generations: GenerationResult[],
  checks: FidelityResult[],
  current: { verifier: string; promptVersion: string },
  { limit, redo = [] }: { limit?: number; redo?: string[] } = {},
): GenerationResult[] {
  // recusa não tem afirmação para conferir
  const answered = generations.filter((generation) => !generation.notFound);
  const known = new Set(answered.map((generation) => generation.id));
  const unknown = redo.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new Error(
      `--redo: ${unknown.join(", ")} não tem resposta para conferir`,
    );
  }

  const checked = latestFidelity(checks, current);
  const pending = answered
    .filter(
      (generation) =>
        redo.includes(generation.id) ||
        checked.get(generation.id)?.answer !== generation.answer,
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  return limit === undefined ? pending : pending.slice(0, limit);
}

async function askVerifier(
  verifier: AnswerModel,
  prompt: Parameters<AnswerModel["stream"]>[0],
): Promise<string | null> {
  try {
    let text = "";
    for await (const piece of verifier.stream(prompt)) text += piece;
    return text;
  } catch (error) {
    logger.error({ err: error, model: verifier.name }, "fidelity call failed");
    return null;
  }
}

async function verify(
  verifier: AnswerModel,
  prompt: Parameters<AnswerModel["stream"]>[0],
  expectedIds: number[],
): Promise<Verdict[] | null> {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const text = await askVerifier(verifier, prompt);
    // erro da API: o SDK já tentou de novo, e insistir só gastaria cota
    if (text === null) return null;

    const parsed = parseVerdicts(text, expectedIds);
    if (parsed.ok) return parsed.verdicts;
    logger.warn(
      { model: verifier.name, attempt, reason: parsed.reason },
      "verifier answer was not usable",
    );
  }
  return null;
}

// null quando o verificador falhou; o motivo já foi para o log
export async function checkFidelity(
  generation: GenerationResult,
  { verifier, textOf }: FidelityDeps,
): Promise<FidelityResult | null> {
  const entries = splitClaims(generation.answer).map((claim) => ({
    claim,
    // só as citações que apontam para uma fonte que existe
    sources: claim.citations.filter(
      (n) => n >= 1 && n <= generation.sources.length,
    ),
  }));
  const sendable = entries.filter((entry) => entry.sources.length > 0);
  const checked: CheckedClaim[] = sendable.map((entry, index) => ({
    id: index + 1,
    text: entry.claim.text,
    citations: entry.sources,
  }));

  const verdicts = new Map<number, Verdict>();
  if (checked.length > 0) {
    const numbers = [
      ...new Set(checked.flatMap((claim) => claim.citations)),
    ].sort((a, b) => a - b);
    const sources: FidelitySource[] = numbers.map((n) => {
      const key = generation.sources[n - 1];
      const text = textOf(key);
      if (text === undefined) {
        throw new Error(
          `trecho ${keyOf(key)} não está no banco: o corte mudou desde a geração?`,
        );
      }
      return { n, text };
    });

    const received = await verify(
      verifier,
      buildFidelityPrompt(checked, sources),
      checked.map((claim) => claim.id),
    );
    if (!received) return null;
    for (const verdict of received) verdicts.set(verdict.id, verdict);
  }

  let nextId = 1;
  const claims: ClaimVerdict[] = entries.map(({ claim, sources }) => {
    if (sources.length === 0) {
      return {
        text: claim.text,
        citations: claim.citations,
        supported: false,
        reason: NO_SOURCE_REASON,
      };
    }
    const verdict = verdicts.get(nextId++)!;
    return {
      text: claim.text,
      citations: claim.citations,
      supported: verdict.supported,
      reason: verdict.reason,
    };
  });

  return {
    id: generation.id,
    verifier: verifier.name,
    promptVersion: FIDELITY_PROMPT_VERSION,
    answer: generation.answer,
    claims,
  };
}
