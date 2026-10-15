export type Inline =
  | { kind: "text"; text: string }
  | { kind: "bold"; children: Inline[] }
  | { kind: "citation"; numbers: number[] };

export type Block =
  | { kind: "paragraph"; lines: Inline[][] }
  | { kind: "list"; items: Inline[][] };

const LIST_ITEM = /^\s*[-*]\s+/;
const CITATION = /\[\s*(\d+(?:\s*,\s*\d+)*)\s*\]/g;
const BOLD = /\*\*(.+?)\*\*/g;

// só o que o modelo de fato escreve (parágrafo, lista com "-", **negrito** e [n]); o resto fica como texto
export function parseAnswer(answer: string, sourceCount: number): Block[] {
  return answer
    .trim()
    .split(/\n\s*\n/)
    .flatMap((chunk) => {
      const lines = chunk
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      return lines.length === 0 ? [] : toBlocks(lines, sourceCount);
    });
}

function toBlocks(lines: string[], sourceCount: number): Block[] {
  const blocks: Block[] = [];
  for (const line of lines) {
    const isItem = LIST_ITEM.test(line);
    const content = parseInline(line.replace(LIST_ITEM, ""), sourceCount);
    const last = blocks.at(-1);
    if (isItem) {
      if (last?.kind === "list") last.items.push(content);
      else blocks.push({ kind: "list", items: [content] });
    } else if (last?.kind === "paragraph") {
      last.lines.push(content);
    } else {
      blocks.push({ kind: "paragraph", lines: [content] });
    }
  }
  return blocks;
}

export function parseInline(text: string, sourceCount: number): Inline[] {
  const inlines: Inline[] = [];
  let cursor = 0;
  for (const match of text.matchAll(BOLD)) {
    inlines.push(
      ...withCitations(text.slice(cursor, match.index), sourceCount),
    );
    inlines.push({
      kind: "bold",
      children: withCitations(match[1], sourceCount),
    });
    cursor = match.index + match[0].length;
  }
  inlines.push(...withCitations(text.slice(cursor), sourceCount));
  return inlines;
}

function withCitations(text: string, sourceCount: number): Inline[] {
  const inlines: Inline[] = [];
  let cursor = 0;
  for (const match of text.matchAll(CITATION)) {
    const numbers = match[1].split(",").map(Number);
    // um [9] com 6 fontes não aponta para nada: fica como texto, para não criar um link quebrado
    if (!numbers.every((n) => n >= 1 && n <= sourceCount)) continue;
    pushText(inlines, text.slice(cursor, match.index));
    inlines.push({ kind: "citation", numbers });
    cursor = match.index + match[0].length;
  }
  pushText(inlines, text.slice(cursor));
  return inlines;
}

function pushText(inlines: Inline[], text: string) {
  if (text) inlines.push({ kind: "text", text });
}
