import { beforeEach, describe, expect, it, vi } from "vitest";
import { listExamples, loadExample } from "@/examples/cached-answers";
import { GET as getExample } from "./[slug]/route";
import { GET as getExamples } from "./route";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/examples/cached-answers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/examples/cached-answers")>()),
  listExamples: vi.fn(),
  loadExample: vi.fn(),
}));

const slugContext = (slug: string) => ({ params: Promise.resolve({ slug }) });

const cdnCache = (response: Response) =>
  response.headers.get("Cache-Control") ?? "";

describe("example routes", () => {
  beforeEach(() => {
    vi.mocked(listExamples).mockReset();
    vi.mocked(loadExample).mockReset();
  });

  it("lets the CDN keep the example list for a day", async () => {
    vi.mocked(listExamples).mockResolvedValue([
      { slug: "merenda-escolar", question: "Saiu licitação de merenda?" },
    ]);

    const response = await getExamples();

    expect(response.status).toBe(200);
    expect(cdnCache(response)).toContain("s-maxage=86400");
  });

  it("lets the CDN keep an example answer for a day", async () => {
    vi.mocked(loadExample).mockResolvedValue({
      slug: "merenda-escolar",
      question: "Saiu licitação de merenda?",
      answer: "Saiu [1].",
      citations: [1],
      notFound: false,
      sources: [],
      generatedAt: "2026-10-16T12:00:00.000Z",
    });

    const response = await getExample(
      new Request("http://test/api/examples/merenda-escolar"),
      slugContext("merenda-escolar"),
    );

    expect(response.status).toBe(200);
    expect(cdnCache(response)).toContain("s-maxage=86400");
  });

  it.each([
    [
      "the list fails",
      () => {
        vi.mocked(listExamples).mockRejectedValue(new Error("banco fora"));
        return getExamples();
      },
      500,
    ],
    [
      "an example fails",
      () => {
        vi.mocked(loadExample).mockRejectedValue(new Error("banco fora"));
        return getExample(
          new Request("http://test/api/examples/x"),
          slugContext("x"),
        );
      },
      500,
    ],
    [
      "an example does not exist yet",
      () => {
        vi.mocked(loadExample).mockResolvedValue(null);
        return getExample(
          new Request("http://test/api/examples/x"),
          slugContext("x"),
        );
      },
      404,
    ],
  ])("keeps nothing in the CDN when %s", async (_case, respond, status) => {
    const response = await respond();

    expect(response.status).toBe(status);
    expect(cdnCache(response)).not.toContain("s-maxage");
  });
});
