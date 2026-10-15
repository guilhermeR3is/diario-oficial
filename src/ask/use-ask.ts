"use client";

import { useCallback, useReducer, useRef } from "react";
import { EMBEDDING_MODEL } from "@/embedding/model";
import type { ExampleAnswer } from "@/examples/cached-answers";
import type { AskEvent } from "@/generation/handle-ask";
import { readSse } from "@/generation/read-sse";
import { askReducer, failureForStatus, initialAskState } from "./ask-state";
import { type QueryEmbedder, createQueryEmbedder } from "./query-embedder";

// sem resposta em 3 s, o mais provável é o banco gratuito acordando
const SLOW_SEARCH_MS = 3_000;

export function useAsk() {
  const [state, dispatch] = useReducer(askReducer, initialAskState);
  const lastRequest = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const skipModel = useRef<(() => void) | null>(null);
  const embedder = useRef<QueryEmbedder | null>(null);

  const begin = () => {
    controller.current?.abort();
    skipModel.current = null;
    controller.current = new AbortController();
    return {
      requestId: ++lastRequest.current,
      signal: controller.current.signal,
    };
  };

  // devolve null quando a pergunta deve ir só pela busca textual
  const vectorFor = async (question: string, requestId: number) => {
    embedder.current ??= createQueryEmbedder();
    const skipped = new Promise<null>((resolve) => {
      skipModel.current = () => resolve(null);
    });
    try {
      return await Promise.race([
        embedder.current.embed(question, (loadedBytes, totalBytes) =>
          dispatch({
            type: "model-progress",
            requestId,
            loadedBytes,
            totalBytes,
          }),
        ),
        skipped,
      ]);
    } catch (error) {
      console.error(error);
      return null;
    }
  };

  const askExample = useCallback(async (slug: string, question: string) => {
    const { requestId, signal } = begin();
    dispatch({ type: "example-requested", requestId, question });
    try {
      const response = await fetch(
        `/api/examples/${encodeURIComponent(slug)}`,
        { signal },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const example = (await response.json()) as ExampleAnswer;
      dispatch({ type: "example-loaded", requestId, example });
    } catch (error) {
      if (!signal.aborted) {
        console.error(error);
        dispatch({ type: "failed", requestId, reason: "example" });
      }
    }
  }, []);

  const askLive = useCallback(async (question: string) => {
    const { requestId, signal } = begin();
    dispatch({ type: "live-requested", requestId, question });

    const vector = await vectorFor(question, requestId);
    if (signal.aborted) return;
    dispatch({
      type: "search-started",
      requestId,
      searchMode: vector ? "hybrid" : "text",
      at: performance.now(),
    });

    const slowTimer = setTimeout(
      () => dispatch({ type: "slow", requestId }),
      SLOW_SEARCH_MS,
    );
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          vector ? { question, model: EMBEDDING_MODEL, vector } : { question },
        ),
        signal,
      });
      if (!response.ok || !response.body) {
        dispatch({
          type: "failed",
          requestId,
          reason: failureForStatus(response.status),
        });
        return;
      }
      for await (const message of readSse(response.body)) {
        clearTimeout(slowTimer);
        const event = JSON.parse(message.data) as AskEvent;
        dispatch({ type: "event", requestId, event, at: performance.now() });
      }
      // o stream acabou sem done nem error: a conexão caiu no meio
      dispatch({ type: "failed", requestId, reason: "generation" });
    } catch (error) {
      if (!signal.aborted) {
        console.error(error);
        dispatch({ type: "failed", requestId, reason: "network" });
      }
    } finally {
      clearTimeout(slowTimer);
    }
  }, []);

  const answerWithoutModel = useCallback(() => skipModel.current?.(), []);
  const reset = useCallback(() => {
    controller.current?.abort();
    dispatch({ type: "reset" });
  }, []);

  return { state, askExample, askLive, answerWithoutModel, reset };
}

export async function sendFeedback(queryId: string, useful: boolean) {
  const response = await fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ queryId, useful }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}
