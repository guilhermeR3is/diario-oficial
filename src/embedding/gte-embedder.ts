import path from "node:path";
import { env, pipeline } from "@huggingface/transformers";
import { MODEL_DTYPE, MODEL_REPO, MODEL_REVISION } from "./model";

export type Embed = (text: string) => Promise<number[]>;

export async function loadEmbedder(): Promise<Embed> {
  env.cacheDir = path.resolve("data/models");
  const extractor = await pipeline("feature-extraction", MODEL_REPO, {
    dtype: MODEL_DTYPE,
    revision: MODEL_REVISION,
  });

  // um texto por vez: o lote de 8 foi 1,6x mais lento e deixava o vetor depender dos vizinhos de lote
  return async (text) => {
    const output = await extractor(text, { pooling: "cls", normalize: true });
    return Array.from(output.data as Float32Array);
  };
}
