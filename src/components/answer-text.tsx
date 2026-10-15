import { Fragment } from "react";
import { type Inline, parseAnswer } from "@/ask/answer-segments";
import { formatPages, keepCurrencyTogether } from "@/ask/format";
import type { SearchHit } from "@/search/search-hit";
import { CitationChip } from "./citation-chip";

export function AnswerText({
  text,
  sources,
  active,
  onCite,
}: {
  text: string;
  sources: SearchHit[];
  active: number | null;
  onCite: (n: number) => void;
}) {
  const renderInline = (inlines: Inline[]) =>
    inlines.map((inline, index) => {
      if (inline.kind === "text")
        return (
          <Fragment key={index}>{keepCurrencyTogether(inline.text)}</Fragment>
        );
      if (inline.kind === "bold")
        return <strong key={index}>{renderInline(inline.children)}</strong>;
      return (
        <Fragment key={index}>
          {inline.numbers.map((n) => {
            const source = sources[n - 1];
            return (
              <CitationChip
                key={n}
                n={n}
                label={`${source.title}, ${formatPages(source.page, source.pageEnd)}`}
                active={active === n}
                onSelect={onCite}
              />
            );
          })}
        </Fragment>
      );
    });

  return (
    <div className="flex max-w-[60ch] flex-col gap-4 text-[1.125rem] leading-[1.65] [overflow-wrap:anywhere]">
      {parseAnswer(text, sources.length).map((block, index) =>
        block.kind === "paragraph" ? (
          <p key={index}>
            {block.lines.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex > 0 && <br />}
                {renderInline(line)}
              </Fragment>
            ))}
          </p>
        ) : (
          <ul key={index} className="flex list-disc flex-col gap-1 pl-6">
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>{renderInline(item)}</li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
