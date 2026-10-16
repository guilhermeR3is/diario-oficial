import type { PrismaClient } from "../../generated/prisma/client";

export type LiveLimits = { site: number; visitor: number };

export type SlotOutcome = "granted" | "visitor-limit" | "site-limit";

// nenhum hash de visitante tem este formato (são 64 dígitos hexadecimais)
const SITE_KEY = "site";

const SAO_PAULO_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
});

// "volte amanhã" é lido por quem está no Brasil, então o dia vira à meia-noite de Brasília
export function liveDay(now: Date): string {
  return SAO_PAULO_DATE.format(now);
}

class LimitReached extends Error {
  constructor(readonly outcome: Exclude<SlotOutcome, "granted">) {
    super(outcome);
  }
}

type Transaction = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

// soma 1 só se a conta ainda está abaixo do limite; sem linha devolvida, o limite já foi atingido
async function increment(
  tx: Transaction,
  day: string,
  key: string,
  limit: number,
): Promise<boolean> {
  const rows = await tx.$queryRaw<{ count: number }[]>`
    INSERT INTO live_usage (day, key, count)
    VALUES (${day}::date, ${key}, 1)
    ON CONFLICT (day, key) DO UPDATE SET count = live_usage.count + 1
    WHERE live_usage.count < ${limit}
    RETURNING count`;
  return rows.length === 1;
}

/** Reserva uma pergunta livre do dia para o visitante e para o site, ou nenhuma das duas. */
export async function reserveLiveSlot(
  db: PrismaClient,
  {
    day,
    visitorHash,
    limits,
  }: {
    day: string;
    visitorHash: string;
    limits: LiveLimits;
  },
): Promise<SlotOutcome> {
  try {
    await db.$transaction(async (tx) => {
      // sempre visitante antes do site: a mesma ordem de travas em todos os pedidos evita deadlock
      if (!(await increment(tx, day, visitorHash, limits.visitor)))
        throw new LimitReached("visitor-limit");
      if (!(await increment(tx, day, SITE_KEY, limits.site)))
        throw new LimitReached("site-limit");
    });
    return "granted";
  } catch (error) {
    if (error instanceof LimitReached) return error.outcome;
    throw error;
  }
}

// a Groq disse que a cota do dia acabou: os próximos visitantes recebem "indisponível hoje" sem gastar uma pergunta
export async function closeLiveDay(
  db: PrismaClient,
  { day, siteLimit }: { day: string; siteLimit: number },
): Promise<void> {
  await db.$executeRaw`
    INSERT INTO live_usage (day, key, count)
    VALUES (${day}::date, ${SITE_KEY}, ${siteLimit})
    ON CONFLICT (day, key) DO UPDATE
    SET count = GREATEST(live_usage.count, EXCLUDED.count)`;
}
