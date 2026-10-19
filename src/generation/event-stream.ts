// o que sai pela rede é o evento da rota, já sem o detalhe técnico das falhas
import type { AskEvent } from "./handle-ask";

// o JSON não tem quebra de linha crua, então o evento cabe sempre numa linha "data:"
export function encodeSseEvent(event: AskEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export function toEventStream(
  events: AsyncGenerator<AskEvent>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async pull(controller) {
      const next = await events.next();
      if (next.done) controller.close();
      else controller.enqueue(encoder.encode(encodeSseEvent(next.value)));
    },
    // o navegador fechou: o return desce até o modelo e a geração para
    async cancel() {
      await events.return(undefined);
    },
  });
}
