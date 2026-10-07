import { z } from "zod";
import { appendJsonl, parseJsonl, readJsonl } from "./jsonl-store";
import { chunkKey } from "./questions";

const generationResultSchema = z.strictObject({
  id: z.string().regex(/^q\d{2}$/),
  model: z.string().min(1),
  promptVersion: z.string().min(1),
  answer: z.string(),
  notFound: z.boolean(),
  citations: z.array(z.number().int()),
  invalidCitations: z.array(z.number().int()),
  // na ordem do prompt: a fonte [n] é sources[n - 1]
  sources: z.array(chunkKey),
});

export type GenerationResult = z.infer<typeof generationResultSchema>;

export const parseResults = (raw: string) =>
  parseJsonl(raw, generationResultSchema);

export const readResults = (path: string) =>
  readJsonl(path, generationResultSchema);

export const appendResult = (path: string, result: GenerationResult) =>
  appendJsonl(path, result);

// o arquivo só cresce: se uma pergunta aparece de novo para o mesmo modelo e prompt, vale a última
export function latestResults(
  results: GenerationResult[],
  { model, promptVersion }: { model: string; promptVersion: string },
): Map<string, GenerationResult> {
  const latest = new Map<string, GenerationResult>();
  for (const result of results) {
    if (result.model === model && result.promptVersion === promptVersion) {
      latest.set(result.id, result);
    }
  }
  return latest;
}
