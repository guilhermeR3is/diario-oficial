import { loadEmbedder } from "@/embedding/gte-embedder";
import { EMBEDDING_MODEL } from "@/embedding/model";
import type { AnswerEvent } from "@/generation/generate-answer";
import { readSse } from "@/generation/read-sse";

function optionalArgument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .find((item) => item.startsWith(prefix))
    ?.slice(prefix.length);
}

function argument(name: string): string {
  const value = optionalArgument(name);
  if (value === undefined) throw new Error(`falta --${name}=...`);
  return value;
}

async function main() {
  const url = argument("url");
  const question = argument("question");
  const stopAfter = Number(optionalArgument("stop-after") ?? Infinity);

  const embed = await loadEmbedder();
  const vector = await embed(question);

  const startedAt = performance.now();
  const elapsed = () => `${Math.round(performance.now() - startedAt)} ms`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBEDDING_MODEL, vector, question }),
  });
  process.stdout.write(
    `status ${response.status}, ${response.headers.get("content-type")}\n`,
  );
  if (!response.body || response.status !== 200) {
    process.stdout.write(`${await response.text()}\n`);
    process.exitCode = 1;
    return;
  }

  let deltas = 0;
  for await (const message of readSse(response.body)) {
    const event = JSON.parse(message.data) as AnswerEvent;
    if (event.type === "sources") {
      process.stdout.write(
        `[${elapsed()}] sources: ${event.sources.length} trechos\n`,
      );
    } else if (event.type === "delta") {
      deltas += 1;
      process.stdout.write(
        `[${elapsed()}] delta ${deltas}: ${JSON.stringify(event.text)}\n`,
      );
      if (deltas >= stopAfter) {
        process.stdout.write(`[${elapsed()}] cliente fechou a conexão\n`);
        break;
      }
    } else {
      process.stdout.write(`[${elapsed()}] ${JSON.stringify(event)}\n`);
    }
  }
  process.stdout.write(`${deltas} pedaços de texto recebidos\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
});
