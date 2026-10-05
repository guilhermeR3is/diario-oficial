import { z } from "zod";
import { logger } from "@/lib/logger";

const PORTAL_URL = "https://diariooficial.saoluis.ma.gov.br";
const PAGE_SIZE = 200;
const REQUEST_TIMEOUT_MS = 30_000;
const USER_AGENT =
  "diario-oficial-portfolio/0.1 (projeto de estudo; somente leitura)";

const portalPageSchema = z.object({
  editions: z.array(
    z.object({
      id: z.number(),
      nome: z.string(),
      data: z.iso.datetime(),
      file_url: z.string().min(1),
    }),
  ),
  total_pages: z.number(),
});

type PortalEditionRow = z.infer<typeof portalPageSchema>["editions"][number];

export type PortalEdition = { title: string; date: string; pdfUrl: string };

export class PortalError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "PortalError";
  }
}

const FILE_NAME_TITLE =
  /^diario[_\s-]+oficial[_\s-]+0*(\d+)[_\s-]+([ivxlcdm]+)(?:[_\s-]+(extra|suplemento))?/i;

// O portal mistura seis formatos de nome; a tela dele também os padroniza para este
export function normalizeTitle(name: string): string {
  const base = name.trim().replace(/\.pdf$/i, "");
  if (/^di[áa]rio\s+oficial\s*-\s*edi[çc][aã]o\b/i.test(base)) return base;
  if (/^edi[çc][aã]o\b/i.test(base)) return `Diário Oficial - ${base}`;

  const fromFileName = FILE_NAME_TITLE.exec(base);
  if (!fromFileName) return base;
  const [, number, volume, kind] = fromFileName;
  const suffix = kind
    ? ` ${kind[0]!.toUpperCase()}${kind.slice(1).toLowerCase()}`
    : "";
  return `Diário Oficial - Edição nº ${number}/${volume!.toUpperCase()}${suffix}`;
}

function toPortalEdition(row: PortalEditionRow): PortalEdition {
  return {
    title: normalizeTitle(row.nome),
    // o portal envia meia-noite UTC, então os 10 primeiros caracteres já são a data do diário
    date: row.data.slice(0, 10),
    pdfUrl: new URL(row.file_url, PORTAL_URL).href,
  };
}

type PortalClientOptions = { fetchFn?: typeof fetch; minIntervalMs?: number };

export function createPortalClient({
  fetchFn = fetch,
  minIntervalMs = 1000,
}: PortalClientOptions = {}) {
  let lastRequestAt = 0;

  // o portal não documenta limite de requisições; uma por segundo mantém o uso leve
  async function get(url: URL): Promise<Response> {
    const wait = lastRequestAt + minIntervalMs - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();

    const response = await fetchFn(url, {
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new PortalError(
        `Portal answered ${response.status} for ${url.pathname}`,
        response.status,
      );
    }
    return response;
  }

  async function listEditions(range: {
    from: string;
    to: string;
  }): Promise<PortalEdition[]> {
    const editions: PortalEdition[] = [];

    for (let page = 1; ; page++) {
      const url = new URL("/api/portal/editions/unified-search", PORTAL_URL);
      url.search = new URLSearchParams({
        start_date: range.from,
        end_date: range.to,
        limit: String(PAGE_SIZE),
        page: String(page),
      }).toString();

      const parsed = portalPageSchema.safeParse(await (await get(url)).json());
      if (!parsed.success) {
        throw new PortalError(
          `Unexpected response format from the portal: ${z.prettifyError(parsed.error)}`,
        );
      }

      editions.push(...parsed.data.editions.map(toPortalEdition));
      if (page >= parsed.data.total_pages) break;
    }

    logger.info({ ...range, count: editions.length }, "portal editions listed");
    return editions;
  }

  return { listEditions };
}
