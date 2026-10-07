import { describe, expect, it } from "vitest";
import { splitClaims } from "./split-claims";

describe("splitClaims", () => {
  it("takes the text up to the citation as the claim, even when the period comes before it", () => {
    expect(
      splitClaims("O crédito suplementar foi de R$ 317.405,00. [1]"),
    ).toEqual([
      { text: "O crédito suplementar foi de R$ 317.405,00.", citations: [1] },
    ]);
  });

  it("joins citations written side by side into one claim, and keeps initials whole", () => {
    expect(
      splitClaims("A empresa foi M. A. SILVA E CIA LTDA. [1] [2]"),
    ).toEqual([
      { text: "A empresa foi M. A. SILVA E CIA LTDA.", citations: [1, 2] },
    ]);
  });

  it("does not cut inside abbreviations or numbers", () => {
    const [claim] = splitClaims(
      "A Portaria n.º 1.346/2026 cita o art. 5º da Lei 8.030 [3].",
    );

    expect(claim.text).toBe(
      "A Portaria n.º 1.346/2026 cita o art. 5º da Lei 8.030",
    );
    expect(claim.citations).toEqual([3]);
  });

  it("makes one claim per citation, and the punctuation after a citation goes to the claim before it", () => {
    expect(
      splitClaims("A lei criou o programa [1]. Também prevê multa [2]."),
    ).toEqual([
      { text: "A lei criou o programa", citations: [1] },
      { text: "Também prevê multa", citations: [2] },
    ]);
  });

  it("splits a list that has no punctuation between the items", () => {
    expect(
      splitClaims(
        "ATA 217/2026 - Registro de Preço[1] ATA 143/2026 - Outro objeto[2]",
      ),
    ).toEqual([
      { text: "ATA 217/2026 - Registro de Preço", citations: [1] },
      { text: "ATA 143/2026 - Outro objeto", citations: [2] },
    ]);
  });

  it("splits a list with line breaks and bullets", () => {
    expect(splitClaims("- Item A [1]\n- Item B [2]")).toEqual([
      { text: "- Item A", citations: [1] },
      { text: "- Item B", citations: [2] },
    ]);
  });

  it("makes the text left after the last citation a claim without sources", () => {
    expect(splitClaims("Fato A [1]. Fato B sem fonte.")).toEqual([
      { text: "Fato A", citations: [1] },
      { text: "Fato B sem fonte.", citations: [] },
    ]);
  });

  it("makes an answer with no citation at all a single claim without sources", () => {
    expect(splitClaims("O decreto foi publicado.")).toEqual([
      { text: "O decreto foi publicado.", citations: [] },
    ]);
  });

  it("does not make a claim out of the punctuation that closes the answer", () => {
    expect(splitClaims("Fato [1].")).toHaveLength(1);
  });

  it("reads several numbers in one bracket, once each and in order", () => {
    expect(splitClaims("Fato [3, 1][1,2]")[0].citations).toEqual([1, 2, 3]);
  });

  it("keeps a number that points to no source, for the caller to decide", () => {
    expect(splitClaims("Fato [9]")[0].citations).toEqual([9]);
  });

  it.each(["", "   \n", "[1]"])("finds no claim in %j", (answer) => {
    expect(splitClaims(answer)).toEqual([]);
  });
});
