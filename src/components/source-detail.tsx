import { ExternalLink } from "lucide-react";
import {
  actLabel,
  formatDate,
  formatPages,
  pdfLink,
  reflowLines,
  shortEdition,
} from "@/ask/format";
import type { SearchHit } from "@/search/search-hit";
import { coverStyle } from "./cover";

export function SourceDetail({ source, n }: { source: SearchHit; n: number }) {
  return (
    <article className="flex flex-col gap-4" aria-label={`Fonte ${n}`}>
      <p
        style={coverStyle(n)}
        className="-mt-px flex items-baseline gap-3 rounded-sm border-[1.5px] border-ink bg-[var(--cover)] px-3 py-2 text-[var(--cover-ink)]"
      >
        <span className="font-heading text-xl leading-none">Fonte {n}</span>
        <span className="text-sm font-semibold">
          {actLabel(source.actType)}
        </span>
      </p>
      <h3 className="text-lg leading-snug font-semibold break-words">
        {source.title}
      </h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Tipo</dt>
        <dd>{actLabel(source.actType)}</dd>
        <dt className="text-muted-foreground">Edição</dt>
        <dd>{shortEdition(source.edition.title)}</dd>
        <dt className="text-muted-foreground">Data</dt>
        <dd>{formatDate(source.date)}</dd>
        <dt className="text-muted-foreground">Página</dt>
        <dd>{formatPages(source.page, source.pageEnd)}</dd>
        <dt className="text-muted-foreground">Órgão</dt>
        <dd>{source.secretariat ?? "não identificado"}</dd>
      </dl>
      <a
        href={pdfLink(source.edition.sourceUrl, source.page)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold underline"
      >
        Abrir o PDF da edição na página {source.page}
        <ExternalLink aria-hidden className="size-3.5" />
        <span className="sr-only">(abre o portal oficial em outra aba)</span>
      </a>
      <div className="border-t-[1.5px] border-ink pt-4">
        <p className="mb-2 text-sm text-muted-foreground">
          Trecho original, como saiu no diário:
        </p>
        <p className="text-[0.95rem] leading-relaxed break-words whitespace-pre-line">
          {reflowLines(source.text)}
        </p>
      </div>
    </article>
  );
}
