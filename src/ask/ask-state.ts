import type { ExampleAnswer } from "@/examples/cached-answers";
import type { AskEvent, SearchMode } from "@/generation/handle-ask";
import type { SearchHit } from "@/search/search-hit";

export type FailureReason =
  // modelo desligado ou cota do dia esgotada
  "unavailable" | "limit" | "network" | "generation" | "example";

export type AnswerOrigin =
  | { kind: "example"; generatedAt: string }
  | {
      kind: "live";
      searchMode: SearchMode;
      queryId: string | null;
      durationMs: number;
    };

export type AskState =
  | { phase: "idle" }
  | { phase: "loading-example"; requestId: number; question: string }
  | {
      phase: "preparing";
      requestId: number;
      question: string;
      loadedBytes: number;
      totalBytes: number | null;
    }
  | {
      phase: "searching";
      requestId: number;
      question: string;
      searchMode: SearchMode;
      startedAt: number;
      slow: boolean;
    }
  | {
      phase: "writing";
      requestId: number;
      question: string;
      searchMode: SearchMode;
      startedAt: number;
      sources: SearchHit[];
      text: string;
    }
  | {
      phase: "answered";
      requestId: number;
      question: string;
      answer: string;
      citations: number[];
      notFound: boolean;
      sources: SearchHit[];
      origin: AnswerOrigin;
    }
  | {
      phase: "failed";
      requestId: number;
      question: string;
      reason: FailureReason;
      sources: SearchHit[];
      partial: string;
    };

export type AskAction =
  | { type: "example-requested"; requestId: number; question: string }
  | { type: "example-loaded"; requestId: number; example: ExampleAnswer }
  | { type: "live-requested"; requestId: number; question: string }
  | {
      type: "model-progress";
      requestId: number;
      loadedBytes: number;
      totalBytes: number | null;
    }
  | {
      type: "search-started";
      requestId: number;
      searchMode: SearchMode;
      at: number;
    }
  | { type: "slow"; requestId: number }
  | { type: "event"; requestId: number; event: AskEvent; at: number }
  | { type: "failed"; requestId: number; reason: FailureReason }
  | { type: "reset" };

export const initialAskState: AskState = { phase: "idle" };

export function askReducer(state: AskState, action: AskAction): AskState {
  if (action.type === "reset") return initialAskState;
  if (action.type === "example-requested") {
    return {
      phase: "loading-example",
      requestId: action.requestId,
      question: action.question,
    };
  }
  if (action.type === "live-requested") {
    return {
      phase: "preparing",
      requestId: action.requestId,
      question: action.question,
      loadedBytes: 0,
      totalBytes: null,
    };
  }
  // resposta de um pedido antigo (o visitante já clicou em outra coisa) é descartada
  if (state.phase === "idle" || state.requestId !== action.requestId)
    return state;

  switch (action.type) {
    case "example-loaded":
      if (state.phase !== "loading-example") return state;
      return {
        phase: "answered",
        requestId: state.requestId,
        question: action.example.question,
        answer: action.example.answer,
        citations: action.example.citations,
        notFound: action.example.notFound,
        sources: action.example.sources,
        origin: { kind: "example", generatedAt: action.example.generatedAt },
      };
    case "model-progress":
      if (state.phase !== "preparing") return state;
      return {
        ...state,
        loadedBytes: action.loadedBytes,
        totalBytes: action.totalBytes,
      };
    case "search-started":
      if (state.phase !== "preparing") return state;
      return {
        phase: "searching",
        requestId: state.requestId,
        question: state.question,
        searchMode: action.searchMode,
        startedAt: action.at,
        slow: false,
      };
    case "slow":
      return state.phase === "searching" ? { ...state, slow: true } : state;
    case "event":
      return applyEvent(state, action.event, action.at);
    case "failed":
      return failed(state, action.reason);
  }
  return state;
}

function applyEvent(state: AskState, event: AskEvent, at: number): AskState {
  if (state.phase === "searching" && event.type === "sources") {
    return {
      phase: "writing",
      requestId: state.requestId,
      question: state.question,
      // o servidor é quem sabe qual busca rodou de fato
      searchMode: event.searchMode,
      startedAt: state.startedAt,
      sources: event.sources,
      text: "",
    };
  }
  if (state.phase !== "writing") return state;
  switch (event.type) {
    case "delta":
      return { ...state, text: state.text + event.text };
    case "done":
      return {
        phase: "answered",
        requestId: state.requestId,
        question: state.question,
        answer: event.answer,
        citations: event.citations,
        notFound: event.notFound,
        sources: state.sources,
        origin: {
          kind: "live",
          searchMode: state.searchMode,
          queryId: event.queryId,
          durationMs: Math.round(at - state.startedAt),
        },
      };
    case "error":
      return failed(state, "generation");
    default:
      return state;
  }
}

function failed(
  state: Exclude<AskState, { phase: "idle" }>,
  reason: FailureReason,
): AskState {
  if (state.phase === "answered" || state.phase === "failed") return state;
  return {
    phase: "failed",
    requestId: state.requestId,
    question: state.question,
    reason,
    sources: state.phase === "writing" ? state.sources : [],
    partial: state.phase === "writing" ? state.text : "",
  };
}

export function failureForStatus(status: number): FailureReason {
  if (status === 429) return "limit";
  if (status === 503) return "unavailable";
  return "network";
}
