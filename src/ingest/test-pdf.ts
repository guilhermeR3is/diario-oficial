function assemble(objects: string[], marker: string): Uint8Array<ArrayBuffer> {
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

// PDF mínimo e válido, com páginas em branco; evita guardar uma edição real como fixture
export function buildPdf(
  pageCount: number,
  marker = "",
): Uint8Array<ArrayBuffer> {
  return assemble(
    [
      "<< /Type /Catalog /Pages 2 0 R >>",
      `<< /Type /Pages /Kids [${Array.from({ length: pageCount }, (_, i) => `${i + 3} 0 R`).join(" ")}] /Count ${pageCount} >>`,
      ...Array.from(
        { length: pageCount },
        () => "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>",
      ),
    ],
    marker,
  );
}

// Uma linha de texto por página; só ASCII, porque a fonte padrão do PDF não tem acentos
export function buildTextPdf(lines: string[]): Uint8Array<ArrayBuffer> {
  const pageIds = lines.map((_, i) => 4 + i * 2);
  return assemble(
    [
      "<< /Type /Catalog /Pages 2 0 R >>",
      `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${lines.length} >>`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      ...lines.flatMap((line, i) => {
        const content = `BT /F1 12 Tf 10 100 Td (${line}) Tj ET`;
        return [
          `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageIds[i]! + 1} 0 R >>`,
          `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
        ];
      }),
    ],
    "",
  );
}
