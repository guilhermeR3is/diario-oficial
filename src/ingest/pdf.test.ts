import { describe, expect, it } from "vitest";
import { countPages } from "./pdf";
import { buildPdf } from "./test-pdf";

describe("countPages", () => {
  it.each([1, 3, 12])("counts %i pages", async (pages) => {
    expect(await countPages(buildPdf(pages))).toBe(pages);
  });

  it("leaves the original bytes usable", async () => {
    const bytes = buildPdf(2);

    await countPages(bytes);

    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it("rejects bytes that are not a readable PDF", async () => {
    await expect(
      countPages(new TextEncoder().encode("%PDF-1.4 lixo")),
    ).rejects.toThrow();
  });
});
