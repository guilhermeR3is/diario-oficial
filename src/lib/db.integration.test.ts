import { setTimeout as sleep } from "node:timers/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDatabase } from "@/test/database";
import { createDb } from "./db";

describe("createDb", () => {
  let testDb: Awaited<ReturnType<typeof startTestDatabase>>;

  const openConnections = async (applicationName: string) => {
    const [row] = await testDb.db.$queryRaw<{ open: number }[]>`
      SELECT count(*)::int AS open FROM pg_stat_activity WHERE application_name = ${applicationName}`;
    return row!.open;
  };

  // o servidor registra o fim da conexão um pouco depois do cliente fechar
  const waitUntilClosed = async (applicationName: string) => {
    for (let attempt = 0; attempt < 20; attempt++) {
      if ((await openConnections(applicationName)) === 0) return 0;
      await sleep(100);
    }
    return openConnections(applicationName);
  };

  const probe = (applicationName: string) =>
    createDb(`${testDb.url}?application_name=${applicationName}`);

  beforeAll(async () => {
    testDb = await startTestDatabase();
  }, 180_000);

  afterAll(async () => {
    await testDb?.stop();
  });

  it("closes its connections when disconnected", async () => {
    const db = probe("probe-disconnect");
    await db.$queryRaw`SELECT 1`;
    expect(await openConnections("probe-disconnect")).toBe(1);

    await db.$disconnect();

    expect(await waitUntilClosed("probe-disconnect")).toBe(0);
  });

  it("closes a connection left idle for five seconds, before the database would fall asleep", async () => {
    const db = probe("probe-idle");
    try {
      await db.$queryRaw`SELECT 1`;
      await sleep(3_000);
      expect(await openConnections("probe-idle")).toBe(1);

      await sleep(3_000);

      expect(await waitUntilClosed("probe-idle")).toBe(0);
    } finally {
      await db.$disconnect();
    }
  }, 15_000);
});
