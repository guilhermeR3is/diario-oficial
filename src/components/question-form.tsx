"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const MAX_LENGTH = 500;

export function QuestionForm({
  onAsk,
  emptyError,
  onEmptyError,
}: {
  onAsk: (question: string) => void;
  // o erro mora em quem chama, para sumir quando a resposta vem de um exemplo
  emptyError: boolean;
  onEmptyError: (visible: boolean) => void;
}) {
  const [question, setQuestion] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  const trimmed = question.trim();

  const submit = () => {
    if (trimmed) return onAsk(trimmed);
    onEmptyError(true);
    field.current?.focus();
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex flex-col gap-2"
    >
      <label htmlFor="question" className="text-lg font-semibold">
        Sua pergunta sobre os diários de julho a setembro de 2026
      </label>
      <Textarea
        id="question"
        ref={field}
        value={question}
        aria-invalid={emptyError || undefined}
        onChange={(event) => {
          setQuestion(event.target.value);
          if (emptyError) onEmptyError(false);
        }}
        onKeyDown={(event) => {
          // Enter envia e Shift+Enter quebra a linha, como nos campos de mensagem
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            submit();
          }
        }}
        maxLength={MAX_LENGTH}
        rows={3}
        placeholder="Ex.: qual empresa foi contratada para a iluminação pública e por quanto?"
        aria-describedby="question-hint"
        className="min-h-24 resize-y rounded-sm border-[1.5px] border-ink bg-white px-3 py-2.5 text-base leading-relaxed shadow-none placeholder:text-ink-faint focus-visible:border-ink focus-visible:ring-0"
      />
      <div className="flex items-center justify-between gap-4">
        <p id="question-hint" className="text-sm text-muted-foreground">
          {emptyError ? (
            <span className="font-semibold text-destructive">
              Escreva uma pergunta antes de enviar.
            </span>
          ) : question.length > 400 ? (
            `${question.length} de ${MAX_LENGTH} caracteres`
          ) : (
            <span className="hidden sm:inline">
              Enter envia; Shift+Enter quebra a linha.
            </span>
          )}
        </p>
        <Button
          type="submit"
          className="h-11 rounded-sm border-[1.5px] border-ink px-6 text-base font-semibold"
        >
          Perguntar
        </Button>
      </div>
    </form>
  );
}
