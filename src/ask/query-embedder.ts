export type EmbedRequest = { id: number; text: string };

export type EmbedResponse =
  | { type: "progress"; loadedBytes: number; totalBytes: number }
  | { type: "vector"; id: number; vector: number[] }
  | { type: "error"; id: number; message: string };

export type DownloadProgress = (
  loadedBytes: number,
  totalBytes: number,
) => void;

export type QueryEmbedder = {
  embed(text: string, onProgress: DownloadProgress): Promise<number[]>;
};

// o worker nasce na primeira pergunta livre: quem só clica nos exemplos nunca baixa os ~340 MB
export function createQueryEmbedder(): QueryEmbedder {
  let worker: Worker | null = null;
  let broken: Error | null = null;
  let nextId = 0;
  const pending = new Map<
    number,
    { resolve: (vector: number[]) => void; reject: (error: Error) => void }
  >();
  const listeners = new Set<DownloadProgress>();

  const failAll = (error: Error) => {
    broken = error;
    for (const { reject } of pending.values()) reject(error);
    pending.clear();
    worker?.terminate();
  };

  const start = () => {
    const created = new Worker(new URL("./embed.worker.ts", import.meta.url), {
      type: "module",
    });
    created.onmessage = ({ data }: MessageEvent<EmbedResponse>) => {
      if (data.type === "progress") {
        for (const listener of listeners)
          listener(data.loadedBytes, data.totalBytes);
        return;
      }
      const request = pending.get(data.id);
      pending.delete(data.id);
      if (data.type === "vector") request?.resolve(data.vector);
      else failAll(new Error(data.message));
    };
    // falta de memória no celular derruba o worker sem mensagem nenhuma
    created.onerror = (event) => {
      event.preventDefault();
      failAll(new Error(event.message || "embedding worker crashed"));
    };
    return created;
  };

  return {
    embed(text, onProgress) {
      if (broken) return Promise.reject(broken);
      worker ??= start();
      const id = nextId++;
      listeners.add(onProgress);
      return new Promise<number[]>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker!.postMessage({ id, text } satisfies EmbedRequest);
      }).finally(() => listeners.delete(onProgress));
    },
  };
}
