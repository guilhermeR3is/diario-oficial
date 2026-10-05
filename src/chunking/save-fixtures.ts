import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { extractPages } from "./extract-pages";

// Edições escolhidas para cobrir os casos do segmentador; o hash aponta o PDF em data/pdfs
const EDITIONS = [
  {
    number: 157,
    date: "2026-07-02",
    title: "Diário Oficial - Edição nº 157/XLVI",
    contentHash:
      "5c33b3fa47fe6b356bdae687e6137eec3c7e6b54e0017aa42205f13cdbe6ec4b",
  },
  {
    number: 160,
    date: "2026-07-06",
    title: "Diário Oficial - Edição nº 160/XLVI",
    contentHash:
      "0878fc7b494b1bf334ed029b30ef93fe2d6cfda5e83f49a88e3453de8fc314b5",
  },
  {
    number: 162,
    date: "2026-07-08",
    title: "Diário Oficial - Edição nº 162/XLVI",
    contentHash:
      "ad6a07ca89541d2939775ede86504cd9dad3876ed54005a455d80653377071ca",
  },
  {
    number: 165,
    date: "2026-07-10",
    title: "Diário Oficial - Edição nº 165/XLVI",
    contentHash:
      "32c1beb1e878bec7a0a663f28ac136962eaed60e54dc03d18023d1f42e44196d",
  },
  {
    number: 190,
    date: "2026-08-13",
    title: "Diário Oficial - Edição nº 190/XLVI - Extra",
    contentHash:
      "13c5fc1d2c26871d8ab3fad2a074c23aa82b5386c3ff6ed767cfa2edea9aa78e",
  },
  {
    number: 196,
    date: "2026-08-19",
    title: "Diário Oficial - Edição nº 196/XLVI",
    contentHash:
      "78c1dbb4fc0ee12da38875badecf070f19156029f247cee8c35daaf8c77b0e9c",
  },
  {
    number: 201,
    date: "2026-08-25",
    title: "Diário Oficial - Edição nº 201/XLVI",
    contentHash:
      "2cccc6c7b4ee70b44f11b7836dcf258b6006f319e6b9fc3b61627c5214d3e699",
  },
  {
    number: 206,
    date: "2026-09-01",
    title: "Diário Oficial - Edição nº 206/XLVI",
    contentHash:
      "1916cc6f202bed11c02a3b45717723d9c5d0a1ea2c258852f8f92719da3cd721",
  },
  {
    number: 209,
    date: "2026-09-02",
    title: "Diário Oficial - Edição nº 209/XLVI Extra",
    contentHash:
      "6dd4cbd6eda5fa029f4210a976986773ca7ad07f6a373eee77c5c29893cace4f",
  },
  {
    number: 225,
    date: "2026-09-24",
    title: "Diário Oficial - Edição nº 225/XLVI",
    contentHash:
      "229a5095bc9f31f296cca312c28869fe71131b64909fcbc3285945c3382780f6",
  },
];

async function main() {
  const pdfDir = path.resolve("data/pdfs");
  const fixturesDir = path.resolve("src/chunking/fixtures");
  await mkdir(fixturesDir, { recursive: true });

  for (const { number, ...edition } of EDITIONS) {
    const bytes = await readFile(
      path.join(pdfDir, `${edition.contentHash}.pdf`),
    );
    const pages = await extractPages(bytes);
    await writeFile(
      path.join(fixturesDir, `edition-${number}.json`),
      JSON.stringify({ ...edition, pages }, null, 1),
    );
    process.stdout.write(`edition ${number}: ${pages.length} pages\n`);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
});
