import type { ExampleQuestion } from "@/examples/cached-answers";
import { cn } from "cn";
import { coverStyle } from "./cover";

export type ExamplesState =
  | { status: "loading"; slow: boolean }
  | { status: "ready"; examples: ExampleQuestion[] }
  | { status: "error" };

export function ExampleCovers({
  state,
  compact,
  activeSlug,
  onPick,
  onRetry,
}: {
  state: ExamplesState;
  compact: boolean;
  activeSlug: string | null;
  onPick: (example: ExampleQuestion) => void;
  onRetry: () => void;
}) {
  return (
    <section aria-labelledby="examples-heading" className="flex flex-col gap-4">
      <h2 id="examples-heading" className="text-base font-semibold">
        {compact
          ? "Outras perguntas de exemplo"
          : "Ou comece por uma pergunta de exemplo"}
      </h2>
      {state.status === "loading" && (
        <div className="flex flex-col gap-3" role="status">
          <ul className={grid(compact)} aria-hidden>
            {Array.from({ length: 6 }, (_, i) => (
              <li
                key={i}
                className={cn(
                  "animate-pulse rounded-sm motion-reduce:animate-none border-[1.5px] border-dashed border-rule bg-muted",
                  compact ? "h-12" : "h-32",
                )}
              />
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">
            {state.slow
              ? "O banco de dados gratuito estava dormindo e está acordando. Leva alguns segundos só na primeira visita."
              : "Carregando as perguntas de exemplo…"}
          </p>
        </div>
      )}
      {state.status === "error" && (
        <p className="text-sm">
          Não consegui carregar as perguntas de exemplo.{" "}
          <button
            type="button"
            onClick={onRetry}
            className="font-semibold underline"
          >
            Tentar de novo
          </button>
        </p>
      )}
      {state.status === "ready" && state.examples.length === 0 && (
        <p className="text-sm text-muted-foreground">
          As perguntas de exemplo ainda não foram geradas. Faça a sua no campo
          acima.
        </p>
      )}
      {state.status === "ready" && state.examples.length > 0 && (
        <ul className={grid(compact)}>
          {state.examples.map((example, index) => (
            <li key={example.slug} className="flex">
              <button
                type="button"
                onClick={() => onPick(example)}
                aria-current={activeSlug === example.slug ? "true" : undefined}
                style={compact ? undefined : coverStyle(index + 1)}
                className={cn(
                  "flex w-full rounded-sm border-[1.5px] border-ink text-left transition-[translate,box-shadow] duration-200 ease-out motion-reduce:transition-none hover:-translate-y-1 hover:shadow-[0_6px_12px_-4px_rgb(var(--shadow-ink)/0.35)] active:translate-y-0 active:shadow-none aria-[current=true]:shadow-[inset_0_0_0_2px_var(--ink)]",
                  compact
                    ? "items-center bg-white px-3 py-2 text-sm leading-snug font-semibold text-ink"
                    : "items-start bg-[var(--cover)] p-4 font-heading text-[1.05rem] leading-[1.3] text-[var(--cover-ink)] min-[420px]:min-h-32 sm:text-[1.15rem]",
                )}
              >
                <span
                  className={cn(
                    "text-pretty",
                    compact ? "line-clamp-2" : "line-clamp-6",
                  )}
                >
                  {example.question}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const grid = (compact: boolean) =>
  cn(
    "grid gap-3",
    compact
      ? "grid-cols-1 sm:grid-cols-2"
      : "grid-cols-1 min-[420px]:grid-cols-2 xl:grid-cols-3",
  );
