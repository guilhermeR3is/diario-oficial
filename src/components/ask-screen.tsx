"use client";

import { cn } from "cn";
import { useCallback, useEffect, useState } from "react";
import { formatSeconds, formatTimestamp } from "@/ask/format";
import { useAsk } from "@/ask/use-ask";
import type { ExampleQuestion } from "@/examples/cached-answers";
import { AnswerText } from "./answer-text";
import { AskStatus } from "./ask-status";
import { type ExamplesState, ExampleCovers } from "./example-covers";
import { FeedbackButtons } from "./feedback-buttons";
import { QuestionForm } from "./question-form";
import { type SourcesView, SourcesPanel } from "./sources-panel";
import { SourcesStrip } from "./sources-strip";

const SLOW_EXAMPLES_MS = 3_000;
const DESKTOP = "(min-width: 1024px)";

const SEARCH_LABEL = {
  hybrid: "Busca híbrida (sentido e palavras)",
  text: "Busca só por palavras (sem o modelo de sentido)",
} as const;

export function AskScreen({
  visitorDailyLimit,
}: {
  visitorDailyLimit: number;
}) {
  const { state, askExample, askLive, answerWithoutModel, reset } = useAsk();
  const [examples, setExamples] = useState<ExamplesState>({
    status: "loading",
    slow: false,
  });
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [lastLive, setLastLive] = useState<string | null>(null);
  const [active, setActive] = useState(1);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [emptyError, setEmptyError] = useState(false);

  const loadExamples = useCallback(async () => {
    setExamples({ status: "loading", slow: false });
    const slowTimer = setTimeout(
      () => setExamples({ status: "loading", slow: true }),
      SLOW_EXAMPLES_MS,
    );
    try {
      const response = await fetch("/api/examples");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setExamples({
        status: "ready",
        examples: (await response.json()) as ExampleQuestion[],
      });
    } catch (error) {
      console.error(error);
      setExamples({ status: "error" });
    } finally {
      clearTimeout(slowTimer);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca única ao abrir a página
    void loadExamples();
  }, [loadExamples]);

  const pickExample = (example: ExampleQuestion) => {
    setEmptyError(false);
    setActiveSlug(example.slug);
    setLastLive(null);
    setActive(1);
    void askExample(example.slug, example.question);
  };

  const ask = (question: string) => {
    setEmptyError(false);
    setActiveSlug(null);
    setLastLive(question);
    setActive(1);
    void askLive(question);
  };

  const cite = (n: number) => {
    setActive(n);
    if (!window.matchMedia(DESKTOP).matches) setDrawerOpen(true);
  };

  const retry = () => {
    if (lastLive) return ask(lastLive);
    const example =
      examples.status === "ready"
        ? examples.examples.find((e) => e.slug === activeSlug)
        : undefined;
    if (example) return pickExample(example);
    reset();
  };

  const sources =
    state.phase === "writing" ||
    state.phase === "answered" ||
    state.phase === "failed"
      ? state.sources
      : [];
  const citations = state.phase === "answered" ? state.citations : [];
  const notFound = state.phase === "answered" && state.notFound;
  const sourcesView: SourcesView =
    sources.length > 0
      ? { kind: "ready", sources, citations, notFound }
      : state.phase === "searching" || state.phase === "loading-example"
        ? { kind: "searching" }
        : state.phase === "answered"
          ? { kind: "none" }
          : { kind: "empty" };
  const answerText =
    state.phase === "answered"
      ? state.answer
      : state.phase === "writing"
        ? state.text
        : state.phase === "failed"
          ? state.partial
          : "";

  return (
    <main className="mx-auto grid w-full max-w-[1440px] gap-8 px-4 py-8 sm:px-8 lg:grid-cols-12 lg:gap-12 lg:py-12">
      <div className="flex min-w-0 flex-col gap-8 lg:col-span-7">
        <QuestionForm
          dailyLimit={visitorDailyLimit}
          onAsk={ask}
          emptyError={emptyError}
          onEmptyError={setEmptyError}
        />

        {state.phase !== "idle" && (
          <section
            aria-labelledby="answer-heading"
            aria-busy={state.phase === "writing"}
            className="flex flex-col gap-5"
          >
            <h2
              id="answer-heading"
              className={cn(
                "font-heading leading-[1.15] font-normal text-balance break-words",
                state.question.length > 140
                  ? "text-lg"
                  : "text-[1.5rem] sm:text-[1.75rem]",
              )}
            >
              {state.question}
            </h2>
            <AskStatus
              state={state}
              onAnswerWithoutModel={answerWithoutModel}
              onRetry={retry}
            />
            {answerText && (
              <AnswerText
                text={answerText}
                sources={sources}
                active={active}
                onCite={cite}
              />
            )}
            {state.phase === "writing" && (
              <span
                aria-hidden
                className="h-5 w-2 animate-pulse bg-ink motion-reduce:animate-none"
              />
            )}
            {state.phase === "answered" && (
              <>
                {state.notFound && (
                  <p className="max-w-[60ch] text-muted-foreground">
                    {sources.length > 0
                      ? "Os trechos mais próximos que a busca achou estão em “Trechos consultados”, para você conferir."
                      : "A busca não achou nenhum trecho parecido com a pergunta."}
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  {state.origin.kind === "example"
                    ? `Resposta de exemplo salva em ${formatTimestamp(state.origin.generatedAt)} · ${SEARCH_LABEL.hybrid} · ${sources.length} trechos`
                    : `${SEARCH_LABEL[state.origin.searchMode]} · ${sources.length} trechos · ${formatSeconds(state.origin.durationMs)}`}
                </p>
                {state.origin.kind === "live" && state.origin.queryId && (
                  <FeedbackButtons
                    key={state.origin.queryId}
                    queryId={state.origin.queryId}
                  />
                )}
              </>
            )}
            {sources.length > 0 && (
              <div className="lg:hidden">
                <SourcesStrip
                  sources={sources}
                  citations={citations}
                  notFound={notFound}
                  active={active}
                  open={drawerOpen}
                  onSelect={cite}
                  onOpenChange={setDrawerOpen}
                />
              </div>
            )}
            <p className="sr-only" role="status">
              {state.phase === "answered" ? "Resposta pronta." : ""}
            </p>
          </section>
        )}

        <ExampleCovers
          state={examples}
          compact={state.phase !== "idle"}
          activeSlug={activeSlug}
          onPick={pickExample}
          onRetry={loadExamples}
        />
      </div>

      <aside className="hidden lg:col-span-5 lg:block">
        <div className="sticky top-4">
          <SourcesPanel
            view={sourcesView}
            active={active}
            onSelect={setActive}
          />
        </div>
      </aside>
    </main>
  );
}
