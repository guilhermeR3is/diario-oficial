export type IndexItem = { title: string; page: number };

export type EditionIndex = {
  items: IndexItem[];
  pageCount: number;
  // trechos que terminavam em pontilhado mas sem número de página
  unreadable: string[];
};

// no pdftotext -raw cada item é "TÍTULO 23" e, na linha de baixo, só pontos
const DOT_LINE = /^\.{5,}\s*$/;
const ITEM = /^(.*\S)\s+(\d{1,3})$/;

export function parseIndex(pages: string[]): EditionIndex {
  const items: IndexItem[] = [];
  const unreadable: string[] = [];
  let pageCount = 0;
  // um título longo ocupa mais de uma linha e pode atravessar a página
  let pending: string[] = [];

  for (const page of pages) {
    const lines = page.split("\n");
    if (!lines.some((line) => DOT_LINE.test(line))) break;
    pageCount++;

    for (const line of lines) {
      if (!DOT_LINE.test(line)) {
        pending.push(line);
        continue;
      }
      const entry = pending.join(" ").replace(/\s+/g, " ").trim();
      const match = ITEM.exec(entry);
      if (match) items.push({ title: match[1]!, page: Number(match[2]) });
      else unreadable.push(entry);
      pending = [];
    }
  }

  return { items, pageCount, unreadable };
}
