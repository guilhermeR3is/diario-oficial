import { z } from "zod";

export const QUESTION_KINDS = [
  "exact",
  "semantic",
  "mixed",
  "unanswerable",
] as const;

export type QuestionKind = (typeof QUESTION_KINDS)[number];

export const chunkKey = z.strictObject({
  sourceUrl: z.url(),
  ordinal: z.number().int().min(0),
});

export type ChunkKey = z.infer<typeof chunkKey>;

export const evalQuestionSchema = z
  .strictObject({
    id: z.string().regex(/^q\d{2}$/),
    kind: z.enum(QUESTION_KINDS),
    question: z.string().min(10).max(300),
    relevant: z.array(chunkKey),
    evidence: z.array(z.string().min(8)),
    absent: z.array(z.string().min(3)),
  })
  .superRefine((question, context) => {
    const required =
      question.kind === "unanswerable" ? ["absent"] : ["relevant", "evidence"];
    const lists = {
      relevant: question.relevant,
      evidence: question.evidence,
      absent: question.absent,
    };

    for (const [field, list] of Object.entries(lists)) {
      if (required.includes(field) && list.length === 0) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: "não pode ficar vazio",
        });
      }
      if (!required.includes(field) && list.length > 0) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: "deve ficar vazio para este tipo",
        });
      }
    }
  });

export type EvalQuestion = z.infer<typeof evalQuestionSchema>;

export function parseQuestions(raw: string): EvalQuestion[] {
  const questions: EvalQuestion[] = [];

  raw.split("\n").forEach((line, index) => {
    if (line.trim() === "") return;
    const lineNumber = index + 1;

    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      throw new Error(`linha ${lineNumber}: JSON inválido`);
    }

    const parsed = evalQuestionSchema.safeParse(json);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map(
          (issue) => `${issue.path.join(".") || "(linha)"}: ${issue.message}`,
        )
        .join("; ");
      throw new Error(`linha ${lineNumber}: ${issues}`);
    }
    questions.push(parsed.data);
  });

  return questions;
}
