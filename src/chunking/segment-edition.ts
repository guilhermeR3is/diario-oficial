import { parseIndex } from "./edition-index";
import { stripPageFooter } from "./page-footer";

export type ActPart = { page: number; text: string };

export type Act = {
  title: string;
  section: string | null;
  parts: ActPart[];
};

export type SegmentationProblem = {
  kind:
    | "no-index"
    | "unreadable-index-entry"
    | "title-not-found"
    | "missing-code"
    | "extra-codes";
  title: string;
  page: number;
};

export type Segmentation = {
  acts: Act[];
  problems: SegmentationProblem[];
};

// um título pode começar numa página e terminar na seguinte
type Position = {
  pageIndex: number;
  start: number;
  endPageIndex: number;
  end: number;
};

const IDENTIFIER_CODE = /Código identificador:/g;
// créditos da edição, na última página; se ficassem, entrariam no texto do último ato
const COLOPHON = /^EXPEDIENTE\s*\n\s*PREFEITURA DE SÃO LUÍS[\s\S]*$/m;
// marcadores de órgão do índice ("ÍNDICE - PUBLICAÇÕES DE TERCEIROS") aparecem no corpo sem o prefixo
const INDEX_PREFIX = /^ÍNDICE\s*-\s*/;

// o PDF quebra a linha até no meio de uma palavra comprida ("SEMMAM/I\nNCID"), então toleramos espaço entre letras
function titlePattern(title: string): RegExp {
  const words = title.trim().split(/\s+/);
  const escaped = words.map((word) =>
    [...word]
      .map((char) => char.replace(/[.*+?^${}()|[\]\\]/, "\\$&"))
      .join("\\s*"),
  );
  return new RegExp(escaped.join("\\s+"), "g");
}

// O mesmo texto aparece dentro de atos ("lotada na\nSECRETARIA ... - SEMUS, após..."), então o título
// precisa começar a linha (ou o título anterior) e terminá-la (ou preceder o próximo título do índice).
function isTitleBoundary(
  text: string,
  match: RegExpExecArray,
  cursorEnd: number | null,
  nextTitle: RegExp | null,
): boolean {
  const end = match.index + match[0].length;
  const startsLine = match.index === 0 || text[match.index - 1] === "\n";
  const followsPreviousTitle =
    cursorEnd !== null && text.slice(cursorEnd, match.index).trim() === "";
  const rest = text.slice(end);
  const endsLine = /^[^\S\n]*(?:\n|$)/.test(rest);
  const precedesNextTitle =
    nextTitle !== null && new RegExp(`^\\s+${nextTitle.source}`).test(rest);

  return (
    (startsLine || followsPreviousTitle) && (endsLine || precedesNextTitle)
  );
}

// o índice cita a página impressa (uma de folga para cada lado); a citada vem primeiro para um título repetido no ato anterior não vencer
function locateTitle(
  bodies: string[],
  title: string,
  nextTitle: string | null,
  page: number,
  cursor: Position,
): Position | null {
  const pattern = titlePattern(title);
  const next = nextTitle === null ? null : titlePattern(nextTitle);
  const candidates = [page - 1, page - 2, page].filter(
    (pageIndex) =>
      pageIndex >= cursor.endPageIndex && pageIndex < bodies.length,
  );

  const search = (pageIndex: number, text: string): Position | null => {
    const cursorEnd = pageIndex === cursor.endPageIndex ? cursor.end : null;
    pattern.lastIndex = cursorEnd ?? 0;
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
      if (!isTitleBoundary(text, match, cursorEnd, next)) continue;
      const pageLength = bodies[pageIndex]!.length;
      const end = match.index + match[0].length;
      if (end <= pageLength) {
        return { pageIndex, start: match.index, endPageIndex: pageIndex, end };
      }
      if (match.index < pageLength) {
        return {
          pageIndex,
          start: match.index,
          endPageIndex: pageIndex + 1,
          end: end - pageLength - 1,
        };
      }
    }
    return null;
  };

  for (const pageIndex of candidates) {
    const position = search(pageIndex, bodies[pageIndex]!);
    if (position) return position;
  }
  // cabeçalho partido na virada de página (edição 172: "... ASSISTÊNCIA SOCIAL -" e, na outra, "SEMCAS")
  for (const pageIndex of candidates) {
    if (pageIndex + 1 >= bodies.length) continue;
    const position = search(
      pageIndex,
      `${bodies[pageIndex]!}\n${bodies[pageIndex + 1]!}`,
    );
    if (position) return position;
  }
  return null;
}

function sliceParts(
  bodies: string[],
  from: Position,
  to: Position | null,
): ActPart[] {
  const lastPageIndex = to ? to.pageIndex : bodies.length - 1;
  const parts: ActPart[] = [];

  for (
    let pageIndex = from.pageIndex;
    pageIndex <= lastPageIndex;
    pageIndex++
  ) {
    const start = pageIndex === from.pageIndex ? from.start : 0;
    const end = to && pageIndex === to.pageIndex ? to.start : undefined;
    const text = bodies[pageIndex]!.slice(start, end).trim();
    if (text !== "") parts.push({ page: pageIndex + 1, text });
  }
  return parts;
}

export function segmentEdition(pages: string[]): Segmentation {
  const bodies = pages.map(stripPageFooter);
  if (bodies.length > 0) {
    const last = bodies.length - 1;
    bodies[last] = bodies[last]!.replace(COLOPHON, "");
  }
  const index = parseIndex(bodies);
  const problems: SegmentationProblem[] = index.unreadable.map((entry) => ({
    kind: "unreadable-index-entry",
    title: entry,
    page: 0,
  }));

  if (index.items.length === 0) {
    problems.push({ kind: "no-index", title: "", page: 1 });
    return { acts: [], problems };
  }

  const located: { title: string; page: number; position: Position }[] = [];
  let cursor: Position = {
    pageIndex: index.pageCount,
    start: 0,
    endPageIndex: index.pageCount,
    end: 0,
  };
  for (const [i, item] of index.items.entries()) {
    const title = item.title.replace(INDEX_PREFIX, "");
    const nextTitle = index.items[i + 1]?.title.replace(INDEX_PREFIX, "");
    const position = locateTitle(
      bodies,
      title,
      nextTitle ?? null,
      item.page,
      cursor,
    );
    if (position) {
      located.push({ title, page: item.page, position });
      cursor = position;
    } else {
      problems.push({ kind: "title-not-found", title, page: item.page });
    }
  }

  const acts: Act[] = [];
  let section: string | null = null;
  for (const [i, { title, page, position }] of located.entries()) {
    const parts = sliceParts(
      bodies,
      position,
      located[i + 1]?.position ?? null,
    );
    const text = parts.map((part) => part.text).join("\n");
    const codes = text.match(IDENTIFIER_CODE)?.length ?? 0;
    const titleEnd = new RegExp(`^${titlePattern(title).source}`).exec(text);
    const afterTitle = text.slice(titleEnd?.[0].length ?? 0).trim();

    // cabeçalho de secretaria: não tem código e nada além do título
    if (codes === 0 && afterTitle === "") {
      section = title;
      continue;
    }
    if (codes === 0) problems.push({ kind: "missing-code", title, page });
    if (codes > 1) problems.push({ kind: "extra-codes", title, page });
    acts.push({ title, section, parts });
  }

  return { acts, problems };
}
