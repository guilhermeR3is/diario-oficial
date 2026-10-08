export type SseMessage = { event: string; data: string };

export async function* readSse(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<SseMessage> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;

      // stream: true segura os bytes de um caractere que o pedaço partiu ao meio
      buffer += decoder.decode(value, { stream: true });
      for (
        let end = buffer.indexOf("\n\n");
        end !== -1;
        end = buffer.indexOf("\n\n")
      ) {
        const message = parseMessage(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
        if (message) yield message;
      }
    }
  } finally {
    // quem para de ler fecha a conexão, e o servidor para de gerar
    await reader.cancel();
  }
}

function parseMessage(block: string): SseMessage | null {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event: ")) event = line.slice("event: ".length);
    else if (line.startsWith("data: ")) data.push(line.slice("data: ".length));
  }
  return data.length > 0 ? { event, data: data.join("\n") } : null;
}
