import { extractText, getDocumentProxy } from "unpdf";

export async function extractPages(bytes: Uint8Array): Promise<string[]> {
  // o pdf.js esvazia o buffer recebido (veja countPages)
  const pdf = await getDocumentProxy(bytes.slice());
  try {
    const { text } = await extractText(pdf, { mergePages: false });
    return text;
  } finally {
    await pdf.loadingTask.destroy();
  }
}
