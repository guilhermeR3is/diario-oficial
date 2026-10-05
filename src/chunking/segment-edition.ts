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

type Position = { pageIndex: number; start: number; end: number };

const IDENTIFIER_CODE = /Código identificador:/g;
// créditos da edição, na última página; se ficassem, entrariam no texto do último ato
const COLOPHON = /^EXPEDIENTE\s*\n\s*PREFEITURA DE SÃO LUÍS[\s\S]*$/m;
// marcadores de órgão do índice ("ÍNDICE - PUBLICAÇÕES DE TERCEIROS") aparecem no corpo sem o prefixo
const INDEX_PREFIX = /^ÍNDICE\s*-\s*/;

function titlePattern(title: string): RegExp {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped.replace(/\s+/g, "\\s+"), "g");
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

// o índice cita a página impressa; aceitamos uma de folga para cada lado
function locateTitle(
  bodies: string[],
  title: string,
  nextTitle: string | null,
  page: number,
  cursor: Position,
): Position | null {
  const pattern = titlePattern(title);
  const next = nextTitle === null ? null : titlePattern(nextTitle);
  const first = Math.max(cursor.pageIndex, page - 2);
  const last = Math.min(bodies.length - 1, page);

  for (let pageIndex = first; pageIndex <= last; pageIndex++) {
    const text = bodies[pageIndex]!;
    const cursorEnd = pageIndex === cursor.pageIndex ? cursor.end : null;
    pattern.lastIndex = cursorEnd ?? 0;
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
      if (isTitleBoundary(text, match, cursorEnd, next)) {
        return {
          pageIndex,
          start: match.index,
          end: match.index + match[0].length,
        };
      }
    }
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
  let cursor: Position = { pageIndex: index.pageCount, start: 0, end: 0 };
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
    const afterTitle = text.slice(position.end - position.start).trim();

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
