import type { EvalQuestion } from "@/eval/questions";
import type { AnswerModel } from "@/generation/answer-model";
import { generateAnswer } from "@/generation/generate-answer";
import type { SearchHit } from "@/search/search-hit";
import type { PrismaClient } from "../../generated/prisma/client";

// o texto vem do eval/questions.jsonl pelo id, para a pergunta da tela ser a mesma que foi medida
export const EXAMPLES = [
  { slug: "merenda-escolar", questionId: "q11" },
  { slug: "trocador-de-bebe", questionId: "q16" },
  { slug: "dono-do-cnpj", questionId: "q05" },
  { slug: "iluminacao-publica", questionId: "q27" },
  { slug: "concurso-do-hospital", questionId: "q22" },
  { slug: "escola-de-samba", questionId: "q38" },
] as const;

export type GeneratedExample = {
  questionSlug: string;
  question: string;
  answer: string;
  citations: { sourceUrl: string; ordinal: number }[];
  model: string;
  promptVersion: string;
  position: number;
  generatedAt: Date;
};

export type ExampleDeps = {
  model: AnswerModel;
  vectorOf: (question: string) => Promise<number[]>;
  search: (query: {
    question: string;
    vector: number[];
  }) => Promise<SearchHit[]>;
  sleep: (ms: number) => Promise<void>;
  now: () => Date;
  onExample?: (example: GeneratedExample) => void;
};

export function exampleQuestions(questions: EvalQuestion[]) {
  const byId = new Map(questions.map((question) => [question.id, question]));
  return EXAMPLES.map(({ slug, questionId }) => {
    const question = byId.get(questionId);
    if (!question) throw new Error(`example ${slug}: ${questionId} not found`);
    return { slug, question: question.question };
  });
}

/** Gera todas as respostas ou nenhuma: qualquer falha interrompe antes de gravar. */
export async function generateExamples(
  examples: { slug: string; question: string }[],
  deps: ExampleDeps,
  pauseMs: number,
): Promise<GeneratedExample[]> {
  const generated: GeneratedExample[] = [];
  for (const [index, { slug, question }] of examples.entries()) {
    // o limite de 8 mil tokens por minuto não cabe duas respostas seguidas
    if (index > 0) await deps.sleep(pauseMs);

    const hits = await deps.search({
      question,
      vector: await deps.vectorOf(question),
    });
    const example = await answerOf(deps.model, question, hits);
    const saved: GeneratedExample = {
      questionSlug: slug,
      question,
      answer: example.answer,
      // as 6 fontes na ordem do prompt: o [n] da resposta aponta para o item n
      citations: hits.map((hit) => ({
        sourceUrl: hit.edition.sourceUrl,
        ordinal: hit.ordinal,
      })),
      model: example.model,
      promptVersion: example.promptVersion,
      position: index + 1,
      generatedAt: deps.now(),
    };
    deps.onExample?.(saved);
    generated.push(saved);
  }
  return generated;
}

async function answerOf(
  model: AnswerModel,
  question: string,
  hits: SearchHit[],
) {
  for await (const event of generateAnswer(model, question, hits)) {
    if (event.type === "error") {
      throw new Error(`generation failed for "${question}" (${event.reason})`);
    }
    if (event.type === "done") {
      // a tela mostraria um [n] sem fonte; melhor gerar de novo que salvar
      if (event.invalidCitations.length > 0) {
        throw new Error(
          `"${question}" cites missing sources: ${event.invalidCitations.join(", ")}`,
        );
      }
      return event;
    }
  }
  throw new Error(`generation for "${question}" ended without an answer`);
}

// troca os exemplos de uma vez: a tela nunca vê metade velha e metade nova
export async function saveExamples(
  db: PrismaClient,
  examples: GeneratedExample[],
): Promise<void> {
  await db.$transaction([
    db.cachedAnswer.deleteMany(),
    db.cachedAnswer.createMany({ data: examples }),
  ]);
}
