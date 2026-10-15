"use client";

import { useState } from "react";
import { sendFeedback } from "@/ask/use-ask";
import { Button } from "@/components/ui/button";

type FeedbackState = "idle" | "sending" | "sent" | "failed";

export function FeedbackButtons({ queryId }: { queryId: string }) {
  const [state, setState] = useState<FeedbackState>("idle");
  const [choice, setChoice] = useState<boolean | null>(null);

  const send = async (useful: boolean) => {
    setChoice(useful);
    setState("sending");
    try {
      await sendFeedback(queryId, useful);
      setState("sent");
    } catch (error) {
      console.error(error);
      setState("failed");
    }
  };

  return (
    <div
      className="flex flex-wrap items-center gap-3"
      role="group"
      aria-labelledby={`feedback-${queryId}`}
    >
      <p id={`feedback-${queryId}`} className="text-sm font-semibold">
        Esta resposta foi útil?
      </p>
      {[true, false].map((useful) => (
        <Button
          key={String(useful)}
          type="button"
          variant="outline"
          size="sm"
          disabled={state === "sending"}
          aria-pressed={choice === useful}
          onClick={() => send(useful)}
          className="h-9 rounded-sm border-[1.5px] border-ink bg-white px-4 aria-pressed:bg-ink aria-pressed:text-paper"
        >
          {useful ? "Sim" : "Não"}
        </Button>
      ))}
      <p className="text-sm text-muted-foreground" role="status">
        {state === "sent" && "Obrigado, anotado."}
        {state === "failed" && "Não consegui registrar agora. Tente de novo."}
      </p>
    </div>
  );
}
