import path from "node:path";
import { env, pipeline } from "@huggingface/transformers";

export type Embed = (text: string) => Promise<number[]>;

const MODEL_REPO = "onnx-community/gte-multilingual-base";
// revisão fixa: se o repositório do modelo mudasse, os vetores mudariam em silêncio
const MODEL_REVISION = "2edbf5e672aab465f9ed4c154a8b61791c082c69";

// só vetores com o mesmo nome são comparáveis entre si
export const EMBEDDING_MODEL = `${MODEL_REPO}@${MODEL_REVISION.slice(0, 7)}:q8`;

export async function loadEmbedder(): Promise<Embed> {
  env.cacheDir = path.resolve("data/models");
  const extractor = await pipeline("feature-extraction", MODEL_REPO, {
    dtype: "q8",
    revision: MODEL_REVISION,
  });

  // um texto por vez: o lote de 8 foi 1,6x mais lento e deixava o vetor depender dos vizinhos de lote
  return async (text) => {
    const output = await extractor(text, { pooling: "cls", normalize: true });
    return Array.from(output.data as Float32Array);
  };
}
