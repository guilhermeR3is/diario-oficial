import { describe, expect, it } from "vitest";
import { buildChunks } from "./build-chunks";
import { ACT_TYPES } from "./classify-act";
import { segmentEdition, type Act } from "./segment-edition";
import { MAX_CHARS } from "./split-act";
import { loadFixtures } from "./test-fixtures";

const edition = { date: new Date("2026-07-02"), contentHash: "hash-da-edicao" };

describe("buildChunks", () => {
  it("describes each chunk with type, title, secretariat, date, pages and size", () => {
    const acts: Act[] = [
      {
        title: "PORTARIA N.º 1/2026",
        section: "SECRETARIA MUNICIPAL DE SAÚDE - SEMUS",
        parts: [{ page: 2, text: "texto da portaria" }],
      },
      {
        title: "NOMEAÇÃO DE FULANO",
        section: "PUBLICAÇÕES DE TERCEIROS",
        parts: [{ page: 3, text: "x".repeat(9) }],
      },
    ];

    expect(buildChunks(acts, edition)).toEqual([
      {
        ordinal: 0,
        actType: "PORTARIA",
        title: "PORTARIA N.º 1/2026",
        secretariat: "SEMUS",
        date: edition.date,
        page: 2,
        pageEnd: 2,
        text: "texto da portaria",
        tokenCount: 5,
        contentHash: "hash-da-edicao",
      },
      {
        ordinal: 1,
        actType: "NOMEACAO",
        title: "NOMEAÇÃO DE FULANO",
        secretariat: null,
        date: edition.date,
        page: 3,
        pageEnd: 3,
        text: "xxxxxxxxx",
        tokenCount: 3,
        contentHash: "hash-da-edicao",
      },
    ]);
  });

  it("numbers the pieces of a long act in sequence, keeping the act's data", () => {
    const text = Array.from(
      { length: 200 },
      (_, i) => `Frase ${i} com palavras para encher.`,
    ).join(" ");
    const acts: Act[] = [
      {
        title: "ATA DE REGISTRO N.º 1",
        section: null,
        parts: [{ page: 5, text }],
      },
      {
        title: "DECRETO N.º 2",
        section: null,
        parts: [{ page: 9, text: "curto" }],
      },
    ];

    const drafts = buildChunks(acts, edition);
    const ata = drafts.filter(
      (draft) => draft.title === "ATA DE REGISTRO N.º 1",
    );

    expect(ata.length).toBeGreaterThan(1);
    expect(drafts.map((draft) => draft.ordinal)).toEqual(
      drafts.map((_, i) => i),
    );
    expect(new Set(ata.map((draft) => draft.actType))).toEqual(
      new Set(["ATA"]),
    );
    expect(drafts.at(-1)!.title).toBe("DECRETO N.º 2");
  });

  it("returns no chunks for no acts", () => {
    expect(buildChunks([], edition)).toEqual([]);
  });
});

describe.each(loadFixtures())("buildChunks on $file", (fixture) => {
  const date = new Date(fixture.date);
  const drafts = buildChunks(segmentEdition(fixture.pages).acts, {
    date,
    contentHash: fixture.contentHash,
  });

  it("gives every chunk a page, a date and a type", () => {
    expect(drafts.length).toBeGreaterThan(0);
    for (const draft of drafts) {
      expect(draft.page).toBeGreaterThanOrEqual(1);
      expect(draft.pageEnd).toBeGreaterThanOrEqual(draft.page);
      expect(draft.pageEnd).toBeLessThanOrEqual(fixture.pages.length);
      expect(draft.date).toEqual(date);
      expect(ACT_TYPES).toContain(draft.actType);
      expect(draft.contentHash).toBe(fixture.contentHash);
    }
  });

  it("keeps every chunk non-empty and within the size limit", () => {
    for (const draft of drafts) {
      expect(draft.text.length).toBeGreaterThan(0);
      expect(draft.text.length).toBeLessThanOrEqual(MAX_CHARS);
      expect(draft.tokenCount).toBe(Math.ceil(draft.text.length / 4));
    }
  });

  it("numbers the chunks from zero without gaps", () => {
    expect(drafts.map((draft) => draft.ordinal)).toEqual(
      drafts.map((_, i) => i),
    );
  });
});
