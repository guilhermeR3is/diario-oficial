import { spawn } from "node:child_process";

const LIGATURES = new Map<number, string>([
  [0xfb00, "ff"],
  [0xfb01, "fi"],
  [0xfb02, "fl"],
  [0xfb03, "ffi"],
  [0xfb04, "ffl"],
  [0xfb05, "st"],
  [0xfb06, "st"],
]);
const ZERO_WIDTH_SPACE = 0x200b;
// marcador de lista da fonte Symbol, que o PDF entrega como caractere de uso privado
const SYMBOL_BULLET = 0xf0b7;

// Só as ligaduras: o NFKC inteiro também trocaria "º" por "o" e adulteraria o texto citado
export function normalizeGlyphs(text: string): string {
  let normalized = "";
  for (const char of text) {
    const code = char.codePointAt(0)!;
    const ligature = LIGATURES.get(code);
    if (ligature !== undefined) normalized += ligature;
    else if (code === SYMBOL_BULLET) normalized += "•";
    else if (code === ZERO_WIDTH_SPACE) continue;
    else if (code >= 0xe000 && code <= 0xf8ff) continue;
    else normalized += char;
  }
  return normalized;
}

function runPdftotext(bytes: Uint8Array, executable: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // -raw mantém a ordem do arquivo; o modo padrão espalha o cabeçalho e perde hífens no fim da linha
    const child = spawn(executable, ["-raw", "-", "-"]);
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    // se o pdftotext sai cedo (PDF ilegível) ele fecha a entrada; o erro de verdade vem do código de saída
    child.stdin.on("error", () => {});
    child.on("error", (error: NodeJS.ErrnoException) => {
      reject(
        error.code === "ENOENT"
          ? new Error(
              `${executable} not found; install Poppler (brew install poppler)`,
            )
          : error,
      );
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout).toString("utf8"));
      } else {
        const reason = Buffer.concat(stderr).toString("utf8").trim();
        reject(new Error(`${executable} exited with code ${code}: ${reason}`));
      }
    });
    child.stdin.end(bytes);
  });
}

export async function extractPages(
  bytes: Uint8Array,
  executable = "pdftotext",
): Promise<string[]> {
  const output = await runPdftotext(bytes, executable);
  const pages = normalizeGlyphs(output).split("\f");
  // o pdftotext termina cada página com \f, inclusive a última
  if (pages.at(-1) === "") pages.pop();
  return pages;
}
