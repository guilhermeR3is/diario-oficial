// PDF mínimo e válido, com páginas em branco; evita guardar uma edição real como fixture
export function buildPdf(
  pageCount: number,
  marker = "",
): Uint8Array<ArrayBuffer> {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${Array.from({ length: pageCount }, (_, i) => `${i + 3} 0 R`).join(" ")}] /Count ${pageCount} >>`,
    ...Array.from(
      { length: pageCount },
      () => "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>",
    ),
  ];

  let body = `%PDF-1.4\n% ${marker}\n`;
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefAt = body.length;
  const entries = offsets
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${entries}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;

  return new TextEncoder().encode(body);
}
