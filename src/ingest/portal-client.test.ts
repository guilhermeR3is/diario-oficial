import { describe, expect, it, vi } from "vitest";
// resposta real do portal (jul–set/2026), reduzida a 3 edições com formatos de nome diferentes
import listing from "./fixtures/unified-search.json";
import {
  createPortalClient,
  normalizeTitle,
  PortalError,
} from "./portal-client";
import { buildPdf } from "./test-pdf";

const range = { from: "2026-07-01", to: "2026-09-30" };
const respondWith =
  (body: unknown, status = 200) =>
  async () =>
    Response.json(body, { status });

describe("listEditions", () => {
  it("returns normalized titles, plain dates and absolute PDF URLs", async () => {
    const client = createPortalClient({
      fetchFn: respondWith(listing),
      minIntervalMs: 0,
    });

    expect(await client.listEditions(range)).toEqual([
      {
        title: "Diário Oficial - Edição nº 230/XLVI Extra",
        date: "2026-09-30",
        pdfUrl:
          "https://diariooficial.saoluis.ma.gov.br/uploads/Digitalizados/2026/diario-oficial-edicao-n-230-xlvi.pdf",
      },
      {
        title: "Diário Oficial - Edição nº 199/XLVI",
        date: "2026-08-24",
        pdfUrl:
          "https://diariooficial.saoluis.ma.gov.br/uploads/Digitalizados/2026/edicao-n-199-xlvi.pdf",
      },
      {
        title: "Diário Oficial - Edição nº 188/XLVI",
        date: "2026-08-12",
        pdfUrl:
          "https://diariooficial.saoluis.ma.gov.br/uploads/Digitalizados/diario_oficial/31566/4mIS2YEaK5f1brEf2fJQM2a755_6M0kR.pdf",
      },
    ]);
  });

  it("sends the period and identifies itself", async () => {
    const fetchFn = vi.fn<typeof fetch>(respondWith(listing));
    await createPortalClient({ fetchFn, minIntervalMs: 0 }).listEditions(range);

    const [url, init] = fetchFn.mock.calls[0]!;
    const params = new URL(url as URL).searchParams;
    expect(params.get("start_date")).toBe("2026-07-01");
    expect(params.get("end_date")).toBe("2026-09-30");
    expect(params.get("limit")).toBe("200");
    expect(new Headers(init?.headers).get("user-agent")).toContain(
      "diario-oficial-portfolio",
    );
  });

  it("follows every result page", async () => {
    const [first, ...rest] = listing.editions;
    const fetchFn = vi.fn<typeof fetch>(async (url) => {
      const page = Number(new URL(url as URL).searchParams.get("page"));
      const editions = page === 1 ? [first] : rest;
      return Response.json({ ...listing, editions, total_pages: 2 });
    });

    const editions = await createPortalClient({
      fetchFn,
      minIntervalMs: 0,
    }).listEditions(range);

    expect(editions).toHaveLength(3);
    expect(
      fetchFn.mock.calls.map(([url]) =>
        new URL(url as URL).searchParams.get("page"),
      ),
    ).toEqual(["1", "2"]);
  });

  it("waits between requests", async () => {
    const times: number[] = [];
    const fetchFn = vi.fn<typeof fetch>(async () => {
      times.push(Date.now());
      return Response.json({ ...listing, total_pages: 2 });
    });

    await createPortalClient({ fetchFn, minIntervalMs: 60 }).listEditions(
      range,
    );

    expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(55);
  });

  it("fails with a clear message when the response format changes", async () => {
    const client = createPortalClient({
      fetchFn: respondWith({ editions: [{ id: 1 }], total_pages: 1 }),
      minIntervalMs: 0,
    });

    await expect(client.listEditions(range)).rejects.toThrow(
      /Unexpected response format/,
    );
  });

  it("raises the HTTP status when the portal fails", async () => {
    const client = createPortalClient({
      fetchFn: respondWith({}, 522),
      minIntervalMs: 0,
    });

    await expect(client.listEditions(range)).rejects.toMatchObject({
      name: PortalError.name,
      status: 522,
    });
  });
});

describe("downloadPdf", () => {
  const pdfUrl = "https://diariooficial.saoluis.ma.gov.br/uploads/230.pdf";
  const answerWith =
    (body: BodyInit, status = 200) =>
    async () =>
      new Response(body, { status });

  it("returns the bytes of the PDF", async () => {
    const client = createPortalClient({
      fetchFn: answerWith(buildPdf(2)),
      minIntervalMs: 0,
    });

    expect(await client.downloadPdf(pdfUrl)).toEqual(buildPdf(2));
  });

  it("rejects a 200 answer that is not a PDF", async () => {
    const client = createPortalClient({
      fetchFn: answerWith("<html>Erro</html>"),
      minIntervalMs: 0,
    });

    await expect(client.downloadPdf(pdfUrl)).rejects.toThrow(/not a PDF/);
  });

  it("raises the HTTP status when the file is missing", async () => {
    const client = createPortalClient({
      fetchFn: answerWith("nada", 404),
      minIntervalMs: 0,
    });

    await expect(client.downloadPdf(pdfUrl)).rejects.toMatchObject({
      name: "PortalError",
      status: 404,
    });
  });

  it("refuses to download from another host", async () => {
    const fetchFn = vi.fn<typeof fetch>(answerWith(buildPdf(1)));
    const client = createPortalClient({ fetchFn, minIntervalMs: 0 });

    await expect(
      client.downloadPdf("https://example.com/edicao.pdf"),
    ).rejects.toThrow(/Refusing to download/);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("normalizeTitle", () => {
  it.each([
    [
      "Diário Oficial - Edição nº 230/XLVI Extra",
      "Diário Oficial - Edição nº 230/XLVI Extra",
    ],
    [
      "Diário Oficial - Edição nº 212/XLVI",
      "Diário Oficial - Edição nº 212/XLVI",
    ],
    ["Edição nº 199/XLVI", "Diário Oficial - Edição nº 199/XLVI"],
    ["Edição nº 205/XLVI Extra", "Diário Oficial - Edição nº 205/XLVI Extra"],
    [
      "Diário Oficial - Edição nº 20/XLVI - Extra.pdf",
      "Diário Oficial - Edição nº 20/XLVI - Extra",
    ],
    ["diario_oficial_188_XLVI.pdf", "Diário Oficial - Edição nº 188/XLVI"],
    [
      "diario_oficial_0042_xlvi_extra.pdf",
      "Diário Oficial - Edição nº 42/XLVI Extra",
    ],
  ])("turns %j into %j", (name, title) => {
    expect(normalizeTitle(name)).toBe(title);
  });

  it("keeps a name it does not recognize", () => {
    expect(normalizeTitle("  Relatório especial  ")).toBe("Relatório especial");
  });
});
