import { z } from "zod";
import { appendJsonl, parseJsonl, readJsonl } from "./jsonl-store";

const claimVerdictSchema = z.strictObject({
  text: z.string(),
  citations: z.array(z.number().int()),
  supported: z.boolean(),
  reason: z.string(),
});

const fidelityResultSchema = z.strictObject({
  id: z.string().regex(/^q\d{2}$/),
  verifier: z.string().min(1),
  promptVersion: z.string().min(1),
  // a resposta conferida: se ela for refeita, a conferência antiga deixa de valer
  answer: z.string(),
  claims: z.array(claimVerdictSchema),
});

export type ClaimVerdict = z.infer<typeof claimVerdictSchema>;
export type FidelityResult = z.infer<typeof fidelityResultSchema>;

export const parseFidelityResults = (raw: string) =>
  parseJsonl(raw, fidelityResultSchema);

export const readFidelityResults = (path: string) =>
  readJsonl(path, fidelityResultSchema);

export const appendFidelityResult = (path: string, result: FidelityResult) =>
  appendJsonl(path, result);

// o arquivo só cresce: se uma pergunta aparece de novo para o mesmo verificador e prompt, vale a última
export function latestFidelity(
  results: FidelityResult[],
  { verifier, promptVersion }: { verifier: string; promptVersion: string },
): Map<string, FidelityResult> {
  const latest = new Map<string, FidelityResult>();
  for (const result of results) {
    if (
      result.verifier === verifier &&
      result.promptVersion === promptVersion
    ) {
      latest.set(result.id, result);
    }
  }
  return latest;
}
