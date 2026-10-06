export const ACT_TYPES = [
  "PORTARIA",
  "DECRETO",
  "LEI",
  "RESOLUCAO",
  "EXTRATO",
  "TERMO",
  "ATA",
  "EDITAL",
  "AVISO",
  "NOMEACAO",
  "EXONERACAO",
  "DESIGNACAO",
  "ERRATA",
  "ACORDAO",
  "PAUTA",
  "SUMULA",
  "LICENCIAMENTO",
  "RESULTADO",
  "OUTRO",
] as const;

export type ActType = (typeof ACT_TYPES)[number];

const BY_FIRST_WORD = new Map<string, ActType>([
  ["PORTARIA", "PORTARIA"],
  ["DECRETO", "DECRETO"],
  ["LEI", "LEI"],
  ["RESOLUCAO", "RESOLUCAO"],
  ["EXTRATO", "EXTRATO"],
  ["TERMO", "TERMO"],
  ["ATA", "ATA"],
  ["EDITAL", "EDITAL"],
  ["AVISO", "AVISO"],
  ["NOMEACAO", "NOMEACAO"],
  ["EXONERACAO", "EXONERACAO"],
  ["DESIGNACAO", "DESIGNACAO"],
  ["ERRATA", "ERRATA"],
  ["RETIFICACAO", "ERRATA"],
  ["ACORDAO", "ACORDAO"],
  ["PAUTA", "PAUTA"],
  ["SUMULA", "SUMULA"],
  ["RECEBIMENTO", "LICENCIAMENTO"],
  ["REQUERIMENTO", "LICENCIAMENTO"],
  ["RESULTADO", "RESULTADO"],
]);

// "PRIMEIRO TERMO ADITIVO ..." começa por um ordinal
const ORDINALS = new Set([
  "PRIMEIRO",
  "SEGUNDO",
  "TERCEIRO",
  "QUARTO",
  "QUINTO",
]);

// "REPUBLICADO POR INCORREÇÃO - EXTRATO ..." é um extrato; o prefixo só diz que saiu de novo
const REPUBLICATION_PREFIX =
  /^(?:REPUBLICACAO|REPUBLICADO|PUBLICACAO)(?:\s+POR\s+INCORRECAO)?(?:\s*-\s*|\s+(?:DO|DA|DE)\s+|\s+)/;

export function classifyAct(title: string): ActType {
  const folded = title
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(REPUBLICATION_PREFIX, "");
  const [first, second] = folded.match(/[A-Z]+/g) ?? [];

  if (first !== undefined && ORDINALS.has(first) && second === "TERMO") {
    return "TERMO";
  }
  return (first !== undefined && BY_FIRST_WORD.get(first)) || "OUTRO";
}

// a sigla vem no fim do cabeçalho: "SECRETARIA MUNICIPAL DE SAÚDE - SEMUS"
export function secretariatOf(section: string | null): string | null {
  const match = /\s[-–]\s*([A-Z0-9/]{2,12})$/.exec(section?.trim() ?? "");
  return match?.[1] ?? null;
}
