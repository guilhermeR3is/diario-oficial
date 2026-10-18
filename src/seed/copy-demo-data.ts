import type { PrismaClient } from "../../generated/prisma/client";

type Transaction = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

// em ordem de chave estrangeira: cada tabela só aponta para as anteriores
export const DEMO_TABLES = [
  "territory",
  "edition",
  "chunk",
  "cached_answer",
] as const;

export type DemoTable = (typeof DEMO_TABLES)[number];

export type TableCopy = { table: DemoTable; rows: number };

export type Fingerprint = { rows: number; digest: string | null };

type Progress = (table: DemoTable, copied: number, total: number) => void;

const BATCH_SIZE = 500;

// 20 mil trechos com vetor pela rede levam minutos; o padrão de 5 s do Prisma derrubaria a transação
const TRANSACTION_OPTIONS = { maxWait: 30_000, timeout: 60 * 60_000 };

export async function tableFingerprint(
  db: Transaction,
  table: DemoTable,
): Promise<Fingerprint> {
  const [fingerprint] = await db.$queryRawUnsafe<Fingerprint[]>(
    `SELECT count(*)::int AS rows,
            md5(string_agg(md5(row_to_json(t)::text), '' ORDER BY t.id)) AS digest
     FROM ${table} t`,
  );
  return fingerprint!;
}

// o JSON leva o vetor como texto e volta pela função de entrada do tipo, sem passar por número do JavaScript
async function copyTable(
  from: Transaction,
  to: Transaction,
  table: DemoTable,
  batchSize: number,
  onProgress: Progress,
): Promise<number> {
  const [{ total }] = await from.$queryRawUnsafe<{ total: number }[]>(
    `SELECT count(*)::int AS total FROM ${table}`,
  );
  let copied = 0;
  let afterId = 0;
  for (;;) {
    const [batch] = await from.$queryRawUnsafe<
      { rows: string | null; size: number; last_id: number | null }[]
    >(
      `SELECT json_agg(t ORDER BY t.id)::text AS rows, count(*)::int AS size, max(t.id) AS last_id
       FROM (SELECT * FROM ${table} WHERE id > $1 ORDER BY id LIMIT $2) t`,
      afterId,
      batchSize,
    );
    if (!batch!.rows) return copied;

    await to.$executeRawUnsafe(
      `INSERT INTO ${table} SELECT * FROM json_populate_recordset(NULL::${table}, $1::json)`,
      batch!.rows,
    );
    copied += batch!.size;
    afterId = batch!.last_id!;
    onProgress(table, copied, total);
  }
}

/** Troca os dados de demonstração do destino pelos da origem, com os mesmos ids; se a conferência falhar, nada é gravado. */
export async function copyDemoData(
  source: PrismaClient,
  target: PrismaClient,
  onProgress: Progress = () => {},
  batchSize = BATCH_SIZE,
): Promise<TableCopy[]> {
  // um retrato só da origem, para a conferência comparar com o mesmo estado que foi copiado
  return source.$transaction(
    (from) =>
      target.$transaction(async (to) => {
        await to.$executeRawUnsafe(`TRUNCATE ${DEMO_TABLES.join(", ")}`);

        const copies: TableCopy[] = [];
        for (const table of DEMO_TABLES) {
          const rows = await copyTable(from, to, table, batchSize, onProgress);
          copies.push({ table, rows });
          // os ids vieram prontos; sem isto, o próximo INSERT do destino tentaria o id 1 de novo
          await to.$executeRawUnsafe(
            `SELECT setval(pg_get_serial_sequence('${table}', 'id'),
                           (SELECT COALESCE(max(id), 0) + 1 FROM ${table}), false)`,
          );
        }

        for (const table of DEMO_TABLES) {
          const [expected, copied] = await Promise.all([
            tableFingerprint(from, table),
            tableFingerprint(to, table),
          ]);
          if (
            expected.rows !== copied.rows ||
            expected.digest !== copied.digest
          ) {
            throw new Error(
              `${table}: o destino ficou diferente da origem (${copied.rows} linhas contra ${expected.rows}); nada foi gravado`,
            );
          }
        }
        return copies;
      }, TRANSACTION_OPTIONS),
    { ...TRANSACTION_OPTIONS, isolationLevel: "RepeatableRead" },
  );
}
