import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestDatabase } from "@/test/database";
import { type SlotOutcome, closeLiveDay, reserveLiveSlot } from "./live-limits";

const DAY = "2026-10-15";

describe("live question limits", () => {
  let testDb: Awaited<ReturnType<typeof startTestDatabase>>;
  let db: typeof testDb.db;

  const reserve = (
    visitorHash: string,
    limits = { site: 30, visitor: 5 },
    day = DAY,
  ) => reserveLiveSlot(db, { day, visitorHash, limits });

  const countOf = async (key: string, day = DAY) => {
    const row = await db.liveUsage.findUnique({
      where: { day_key: { day: new Date(day), key } },
    });
    return row?.count ?? 0;
  };

  const outcomes = (results: SlotOutcome[]) =>
    results.reduce<Record<string, number>>((tally, outcome) => {
      tally[outcome] = (tally[outcome] ?? 0) + 1;
      return tally;
    }, {});

  beforeAll(async () => {
    testDb = await startTestDatabase();
    db = testDb.db;
  }, 120_000);

  afterAll(async () => {
    await testDb?.stop();
  });

  beforeEach(async () => {
    await db.liveUsage.deleteMany();
  });

  it("lets a visitor ask up to the visitor limit and then refuses", async () => {
    const limits = { site: 30, visitor: 2 };

    expect(await reserve("ana", limits)).toBe("granted");
    expect(await reserve("ana", limits)).toBe("granted");
    expect(await reserve("ana", limits)).toBe("visitor-limit");
    expect(await reserve("bia", limits)).toBe("granted");
    expect(await countOf("ana")).toBe(2);
    expect(await countOf("site")).toBe(3);
  });

  it("refuses everyone once the site limit is reached, without spending the visitor's question", async () => {
    const limits = { site: 2, visitor: 5 };
    await reserve("ana", limits);
    await reserve("bia", limits);

    expect(await reserve("caio", limits)).toBe("site-limit");
    expect(await countOf("caio")).toBe(0);
    expect(await countOf("site")).toBe(2);
  });

  it("starts each day from zero", async () => {
    const limits = { site: 1, visitor: 1 };

    expect(await reserve("ana", limits, "2026-10-15")).toBe("granted");
    expect(await reserve("ana", limits, "2026-10-15")).toBe("visitor-limit");
    expect(await reserve("ana", limits, "2026-10-16")).toBe("granted");
  });

  it("gives exactly 3 of 20 simultaneous requests when the site limit is 3", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        reserve(`visitante-${index}`, { site: 3, visitor: 5 }),
      ),
    );

    expect(outcomes(results)).toEqual({ granted: 3, "site-limit": 17 });
    expect(await countOf("site")).toBe(3);
  });

  it("gives exactly 3 of 20 simultaneous requests from one visitor when the visitor limit is 3", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        reserve("ana", { site: 30, visitor: 3 }),
      ),
    );

    expect(outcomes(results)).toEqual({ granted: 3, "visitor-limit": 17 });
    expect(await countOf("ana")).toBe(3);
    expect(await countOf("site")).toBe(3);
  });

  it("closes the day for everyone when the model's daily quota runs out", async () => {
    await reserve("ana");
    await closeLiveDay(db, { day: DAY, siteLimit: 30 });

    expect(await reserve("bia")).toBe("site-limit");
    expect(await countOf("site")).toBe(30);
  });

  it("never lowers a count that is already above the limit when closing the day", async () => {
    await closeLiveDay(db, { day: DAY, siteLimit: 30 });
    await closeLiveDay(db, { day: DAY, siteLimit: 10 });

    expect(await countOf("site")).toBe(30);
  });
});
