export const MODEL_REPO = "onnx-community/gte-multilingual-base";
// revisão fixa: se o repositório do modelo mudasse, os vetores mudariam em silêncio
export const MODEL_REVISION = "2edbf5e672aab465f9ed4c154a8b61791c082c69";
export const MODEL_DTYPE = "q8";
export const EMBEDDING_DIMENSIONS = 768;

// só vetores com o mesmo nome são comparáveis entre si
export const EMBEDDING_MODEL = `${MODEL_REPO}@${MODEL_REVISION.slice(0, 7)}:${MODEL_DTYPE}`;
