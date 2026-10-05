import { getDocumentProxy } from "unpdf";

export async function countPages(bytes: Uint8Array): Promise<number> {
  // o pdf.js toma posse do buffer e o esvazia; a cópia preserva os bytes que ainda vamos gravar em disco
  const pdf = await getDocumentProxy(bytes.slice());
  try {
    return pdf.numPages;
  } finally {
    await pdf.loadingTask.destroy();
  }
}
