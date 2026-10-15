import type { AskState } from "@/ask/ask-state";
import { formatMegabytes } from "@/ask/format";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

const FAILURE_TEXT = {
  unavailable:
    "O modelo que escreve as respostas está indisponível hoje. Volte amanhã ou veja as perguntas de exemplo, que funcionam sempre.",
  limit:
    "O limite de perguntas livres de hoje acabou. Volte amanhã ou veja as perguntas de exemplo, que funcionam sempre.",
  network:
    "Não consegui falar com o servidor. Confira a conexão e tente de novo.",
  generation: "O modelo parou no meio da resposta. Tente de novo em instantes.",
  example: "Não consegui carregar esta pergunta de exemplo.",
} as const;

export function AskStatus({
  state,
  onAnswerWithoutModel,
  onRetry,
}: {
  state: AskState;
  onAnswerWithoutModel: () => void;
  onRetry: () => void;
}) {
  if (state.phase === "preparing") {
    const percent = state.totalBytes
      ? (state.loadedBytes / state.totalBytes) * 100
      : 0;
    return (
      <div
        className="flex flex-col gap-3 rounded-sm border-[1.5px] border-ink bg-white p-4"
        role="status"
      >
        <p className="font-semibold">Preparando a busca por sentido</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          O navegador baixa o modelo de busca uma vez (cerca de 360 MB) e o
          guarda para as próximas perguntas.
          {state.totalBytes
            ? ` ${formatMegabytes(state.loadedBytes)} de ${formatMegabytes(state.totalBytes)}.`
            : ""}
        </p>
        <Progress
          value={percent}
          aria-label="Download do modelo de busca"
          className="h-2 rounded-none bg-muted [&>[data-slot=progress-indicator]]:bg-ink"
        />
        <Button
          type="button"
          variant="outline"
          onClick={onAnswerWithoutModel}
          className="h-10 w-fit rounded-sm border-[1.5px] border-ink bg-white"
        >
          Responder agora só com busca por palavras
        </Button>
      </div>
    );
  }
  if (state.phase === "loading-example" || state.phase === "searching") {
    return (
      <p className="text-base text-muted-foreground" role="status">
        {state.phase === "searching" && state.slow
          ? "O banco de dados gratuito estava dormindo e está acordando. Leva alguns segundos só na primeira pergunta."
          : "Procurando nos diários…"}
      </p>
    );
  }
  if (state.phase === "failed") {
    const retryable =
      state.reason !== "unavailable" && state.reason !== "limit";
    return (
      <div className="flex flex-col gap-3" role="alert">
        <p className="max-w-[60ch] text-base leading-relaxed">
          {FAILURE_TEXT[state.reason]}
        </p>
        {retryable && (
          <Button
            type="button"
            onClick={onRetry}
            className="h-10 w-fit rounded-sm border-[1.5px] border-ink"
          >
            Tentar de novo
          </Button>
        )}
      </div>
    );
  }
  return null;
}
