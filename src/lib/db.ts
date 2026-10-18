import { PrismaPg } from "@prisma/adapter-pg";
import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";
import { env } from "@/env";
import { PrismaClient } from "../../generated/prisma/client";

export function createDb(connectionString: string) {
  // a Vercel congela a função parada e o Neon dorme após 5 min: a conexão ociosa fecha antes, e a Vercel espera esse fechamento
  const pool = new Pool({ connectionString, idleTimeoutMillis: 5_000 });
  attachDatabasePool(pool);
  return new PrismaClient({
    adapter: new PrismaPg(pool, { disposeExternalPool: true }),
  });
}

const globalForDb = globalThis as unknown as { db?: PrismaClient };

export const db = globalForDb.db ?? createDb(env.DATABASE_URL);

// o hot reload do `next dev` reexecuta este módulo e abriria uma conexão nova a cada edição
if (process.env.NODE_ENV !== "production") globalForDb.db = db;
