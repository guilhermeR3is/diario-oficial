import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "@/env";
import { PrismaClient } from "../../generated/prisma/client";

export function createDb(connectionString: string) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

const globalForDb = globalThis as unknown as { db?: PrismaClient };

export const db = globalForDb.db ?? createDb(env.DATABASE_URL);

// o hot reload do `next dev` reexecuta este módulo e abriria uma conexão nova a cada edição
if (process.env.NODE_ENV !== "production") globalForDb.db = db;
