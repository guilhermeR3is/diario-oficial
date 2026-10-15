const ACT_LABELS: Record<string, string> = {
  PORTARIA: "Portaria",
  DECRETO: "Decreto",
  LEI: "Lei",
  RESOLUCAO: "Resolução",
  EXTRATO: "Extrato",
  TERMO: "Termo",
  ATA: "Ata",
  EDITAL: "Edital",
  AVISO: "Aviso",
  NOMEACAO: "Nomeação",
  EXONERACAO: "Exoneração",
  DESIGNACAO: "Designação",
  ERRATA: "Errata",
  ACORDAO: "Acórdão",
  PAUTA: "Pauta",
  SUMULA: "Súmula",
  LICENCIAMENTO: "Licenciamento",
  RESULTADO: "Resultado",
  OUTRO: "Outro ato",
};

export const actLabel = (actType: string) => ACT_LABELS[actType] ?? actType;

// a data chega como AAAA-MM-DD; montar à mão evita o fuso do navegador trocar o dia
export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

// instante (não só data): mostrado no horário de São Luís, que é o dos diários
export const formatTimestamp = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" });

export const formatPages = (page: number, pageEnd: number) =>
  pageEnd > page ? `p. ${page}–${pageEnd}` : `p. ${page}`;

// "Diário Oficial - Edição nº 215/XLVI Extra" vira "Edição nº 215 Extra"
export function shortEdition(title: string): string {
  const match = /Edição\s+n[º°o.]*\s*(\d+)(?:\/[A-Z]+)?(.*)$/i.exec(title);
  return match ? `Edição nº ${match[1]}${match[2].trimEnd()}` : title;
}

export function formatSeconds(milliseconds: number): string {
  return `${(milliseconds / 1000).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} s`;
}

export const formatMegabytes = (bytes: number) =>
  `${Math.round(bytes / 1_000_000).toLocaleString("pt-BR")} MB`;

// link direto para a página: os leitores de PDF dos navegadores entendem #page=N
export const pdfLink = (sourceUrl: string, page: number) =>
  `${sourceUrl}#page=${page}`;

const NO_BREAK_SPACE = String.fromCodePoint(0xa0);

// "R$" e o número na mesma linha
export const keepCurrencyTogether = (text: string) =>
  text.replace(/R\$ /g, `R$${NO_BREAK_SPACE}`);

// o PDF quebra a linha pela largura da página; só a quebra depois de pontuação final é do autor
export function reflowLines(text: string): string {
  const lines: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const previous = lines.at(-1);
    if (
      previous === undefined ||
      previous === "" ||
      line === "" ||
      /[.:;!?]$/.test(previous)
    ) {
      lines.push(line);
    } else if (/\p{L}-$/u.test(previous)) {
      // palavra hifenizada no fim da linha: junta sem espaço e mantém o hífen, que pode ser do texto
      lines[lines.length - 1] = previous + line;
    } else {
      lines[lines.length - 1] = `${previous} ${line}`;
    }
  }
  return lines.join("\n");
}
