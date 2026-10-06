import { describe, expect, it } from "vitest";
import { loadEmbedder } from "./gte-embedder";

const dot = (a: number[], b: number[]) =>
  a.reduce((sum, x, i) => sum + x * b[i]!, 0);

// baixa ~340 MB na primeira vez, então só roda quando pedido: EMBEDDING_REAL_MODEL=1 pnpm test src/embedding/gte-embedder
describe.skipIf(!process.env["EMBEDDING_REAL_MODEL"])(
  "gte-multilingual-base (modelo real)",
  () => {
    it("returns a unit vector of 768 numbers that puts the right chunk closer", async () => {
      const embed = await loadEmbedder();

      const [query, related, unrelated] = await Promise.all([
        embed("merenda escolar"),
        embed(
          "Programa Nacional de Alimentação Escolar - PNAE, aquisição de gêneros alimentícios para os alunos",
        ),
        embed("EXONERAÇÃO DE FULANO DE TAL do cargo de Assessor Técnico"),
      ]);

      expect(query).toHaveLength(768);
      expect(dot(query!, query!)).toBeCloseTo(1, 4);
      expect(dot(query!, related!)).toBeGreaterThan(dot(query!, unrelated!));
    }, 600_000);
  },
);
