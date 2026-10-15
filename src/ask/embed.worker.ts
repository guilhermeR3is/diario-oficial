import {
  type FeatureExtractionPipeline,
  env,
  pipeline,
} from "@huggingface/transformers";
import { MODEL_DTYPE, MODEL_REPO, MODEL_REVISION } from "@/embedding/model";
import type { EmbedRequest, EmbedResponse } from "./query-embedder";

env.allowLocalModels = false;

let extractor: Promise<FeatureExtractionPipeline> | null = null;

const reply = (message: EmbedResponse) => self.postMessage(message);

function load() {
  extractor ??= pipeline("feature-extraction", MODEL_REPO, {
    dtype: MODEL_DTYPE,
    revision: MODEL_REVISION,
    progress_callback: (info) => {
      if (info.status === "progress_total") {
        reply({
          type: "progress",
          loadedBytes: info.loaded,
          totalBytes: info.total,
        });
      }
    },
  });
  return extractor;
}

self.onmessage = async ({ data }: MessageEvent<EmbedRequest>) => {
  try {
    const embed = await load();
    // mesmo pooling e normalização do pnpm embed, senão o vetor da pergunta não se compara ao dos trechos
    const output = await embed(data.text, { pooling: "cls", normalize: true });
    reply({
      type: "vector",
      id: data.id,
      vector: Array.from(output.data as Float32Array),
    });
  } catch (error) {
    // um modelo que falhou ao carregar não é tentado de novo: a próxima pergunta já vai pela busca textual
    reply({
      type: "error",
      id: data.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
