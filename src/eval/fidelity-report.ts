import type { ClaimVerdict, FidelityResult } from "./fidelity-result";
import { snippet } from "./generation-report";
import { NO_SOURCE_REASON } from "./run-fidelity";

export type FidelitySummary = {
  answers: number;
  claims: number;
  supported: number;
  unsupported: number;
  noValidCitation: number;
  flagged: { id: string; claims: ClaimVerdict[] }[];
};

const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);

export function summarizeFidelity(checks: FidelityResult[]): FidelitySummary {
  const all = checks.flatMap((check) => check.claims);
  const unsupported = all.filter((claim) => !claim.supported);

  return {
    answers: checks.length,
    claims: all.length,
    supported: all.length - unsupported.length,
    unsupported: unsupported.length,
    noValidCitation: unsupported.filter(
      (claim) => claim.reason === NO_SOURCE_REASON,
    ).length,
    flagged: checks
      .filter((check) => check.claims.some((claim) => !claim.supported))
      .map((check) => ({
        id: check.id,
        claims: check.claims.filter((claim) => !claim.supported),
      }))
      .sort(byId),
  };
}

export function formatFidelityReport(
  checks: FidelityResult[],
  missing: string[],
  meta: { verifier: string; promptVersion: string },
): string {
  const summary = summarizeFidelity(checks);
  const share =
    summary.claims === 0
      ? "nenhuma afirmação"
      : `${summary.supported} de ${summary.claims} (${Math.round((100 * summary.supported) / summary.claims)}%)`;

  const rows = [...checks].sort(byId).map((check) => {
    const unsupported = check.claims.filter((claim) => !claim.supported).length;
    return `| ${check.id} | ${check.claims.length} | ${check.claims.length - unsupported} | ${unsupported} |`;
  });
  const flagged = summary.flagged.flatMap(({ id, claims }) =>
    claims.map(
      (claim) =>
        `- ${id}: "${snippet(claim.text)}" (cita ${claim.citations.length === 0 ? "nada" : claim.citations.map((n) => `[${n}]`).join(" ")}): ${claim.reason}`,
    ),
  );

  return [
    `Verificador: ${meta.verifier} | prompt ${meta.promptVersion} | ${summary.answers} respostas conferidas`,
    missing.length > 0 ? `Sem conferência ainda: ${missing.join(", ")}` : "",
    "",
    "## Afirmações",
    "",
    `Sustentadas pelo trecho citado: ${share}`,
    `Não sustentadas: ${summary.unsupported}, das quais ${summary.noValidCitation} sem citação válida`,
    "",
    "O verificador também erra. Confira à mão os casos de `--sample` antes de confiar nestes números.",
    "",
    "## Afirmações não sustentadas",
    "",
    ...(flagged.length > 0 ? flagged : ["nenhuma"]),
    "",
    "## Por pergunta",
    "",
    "| id | afirmações | sustentadas | não sustentadas |",
    "|---|---|---|---|",
    ...rows,
    "",
  ].join("\n");
}

export type SampleCase = {
  check: FidelityResult;
  question: string;
  sources: { n: number; key: string; text: string }[];
};

// espaçados, não sorteados: o arquivo sai igual a cada execução
function evenly<T>(items: T[], count: number): T[] {
  return Array.from(
    { length: count },
    (_, index) => items[Math.floor((index * items.length) / count)],
  );
}

// metade com alguma afirmação reprovada e metade sem, para medir o verificador nos dois sentidos
export function pickSample(
  checks: FidelityResult[],
  size = 10,
): FidelityResult[] {
  const sorted = [...checks].sort(byId);
  const flagged = sorted.filter((check) =>
    check.claims.some((c) => !c.supported),
  );
  const clean = sorted.filter((check) =>
    check.claims.every((c) => c.supported),
  );

  const fromFlagged = evenly(
    flagged,
    Math.min(flagged.length, Math.ceil(size / 2)),
  );
  const fromClean = evenly(
    clean,
    Math.min(clean.length, size - fromFlagged.length),
  );
  const rest = flagged.filter((check) => !fromFlagged.includes(check));
  const fill = rest.slice(0, size - fromFlagged.length - fromClean.length);

  return [...fromFlagged, ...fromClean, ...fill].sort(byId);
}

export function formatSample(
  cases: SampleCase[],
  meta: { verifier: string; promptVersion: string },
): string {
  const quote = (text: string) =>
    text
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");

  const body = cases.flatMap(({ check, question, sources }) => [
    `## ${check.id}: ${question}`,
    "",
    `**Resposta do modelo:** ${check.answer}`,
    "",
    ...check.claims.flatMap((claim, index) => [
      `### ${check.id}, afirmação ${index + 1}: "${claim.text}"`,
      "",
      `Cita: ${claim.citations.length === 0 ? "nada" : claim.citations.map((n) => `[${n}]`).join(" ")}`,
      "",
      "Sua conferência: [ ] o trecho sustenta  [ ] o trecho não sustenta",
      "",
    ]),
    ...sources.flatMap((source) => [
      `**Trecho [${source.n}]** (${source.key})`,
      "",
      quote(source.text),
      "",
    ]),
  ]);

  const verdicts = cases.flatMap(({ check }) => [
    `### ${check.id}`,
    "",
    ...check.claims.map(
      (claim, index) =>
        `${index + 1}. ${claim.supported ? "SUSTENTADA" : "NÃO SUSTENTADA"}: ${claim.reason}`,
    ),
    "",
  ]);

  return [
    `# Conferência à mão da fidelidade (${cases.length} respostas)`,
    "",
    `Verificador: ${meta.verifier}, prompt ${meta.promptVersion}.`,
    "",
    "Para cada afirmação, leia o trecho citado e marque se ele sustenta o que a resposta diz. **Marque antes de olhar os veredictos do verificador, que ficam no fim do arquivo**: assim a comparação mede se ele concorda com você, e não o contrário. Este arquivo não decide nada por você.",
    "",
    ...body,
    "## Veredictos do verificador (só depois de marcar)",
    "",
    ...verdicts,
  ].join("\n");
}
