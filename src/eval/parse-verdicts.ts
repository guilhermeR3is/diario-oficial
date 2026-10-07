import { z } from "zod";

const verdictsSchema = z.object({
  claims: z.array(
    z.object({
      id: z.number().int(),
      supported: z.boolean(),
      reason: z.string(),
    }),
  ),
});

export type Verdict = { id: number; supported: boolean; reason: string };

export type VerdictParse =
  { ok: true; verdicts: Verdict[] } | { ok: false; reason: string };

export function parseVerdicts(
  text: string,
  expectedIds: number[],
): VerdictParse {
  // modelos de raciocínio às vezes deixam o pensamento no texto, e ele pode ter chaves
  const answer = text.replace(/<think>[\s\S]*?<\/think>/g, "");
  const start = answer.indexOf("{");
  const end = answer.lastIndexOf("}");
  if (start === -1 || end < start) {
    return { ok: false, reason: "sem JSON na resposta" };
  }

  let json: unknown;
  try {
    json = JSON.parse(answer.slice(start, end + 1));
  } catch {
    return { ok: false, reason: "JSON inválido" };
  }

  const parsed = verdictsSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: "formato inesperado" };

  const verdicts = [...parsed.data.claims].sort((a, b) => a.id - b.id);
  const received = verdicts.map((verdict) => verdict.id);
  const expected = [...expectedIds].sort((a, b) => a - b);
  if (received.join(",") !== expected.join(",")) {
    return {
      ok: false,
      reason: `ids esperados ${expected.join(",")}, recebi ${received.join(",")}`,
    };
  }
  return { ok: true, verdicts };
}
