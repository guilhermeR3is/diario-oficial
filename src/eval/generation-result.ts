import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
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

export function parseResults(raw: string): GenerationResult[] {
  const results: GenerationResult[] = [];

  raw.split("\n").forEach((line, index) => {
    if (line.trim() === "") return;
    const lineNumber = index + 1;

    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      throw new Error(`linha ${lineNumber}: JSON inválido`);
    }

    const parsed = generationResultSchema.safeParse(json);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map(
          (issue) => `${issue.path.join(".") || "(linha)"}: ${issue.message}`,
        )
        .join("; ");
      throw new Error(`linha ${lineNumber}: ${issues}`);
    }
    results.push(parsed.data);
  });

  return results;
}

export async function readResults(path: string): Promise<GenerationResult[]> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return parseResults(raw);
}

export async function appendResult(
  path: string,
  result: GenerationResult,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(result)}\n`);
}

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
