import { describe, expect, it, vi } from "vitest";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "@/embedding/model";
import type { PrismaClient } from "../../generated/prisma/client";
import { handleSearchRequest } from "./handle-search";

const unitVector = () =>
  Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i === 0 ? 1 : 0));

const dbReturning = (rows: unknown[]) =>
  ({ $queryRaw: vi.fn(async () => rows) }) as unknown as PrismaClient;

const untouchedDb = () => dbReturning([]);

describe("handleSearchRequest", () => {
  it("answers 200 with the model name and the hits", async () => {
    const outcome = await handleSearchRequest(dbReturning([]), {
      model: EMBEDDING_MODEL,
      vector: unitVector(),
    });

    expect(outcome).toEqual({
      status: 200,
      body: { model: EMBEDDING_MODEL, results: [] },
    });
  });

  it("refuses a vector made by another model and says which one to use", async () => {
    const outcome = await handleSearchRequest(untouchedDb(), {
      model: "outro-modelo",
      vector: unitVector(),
    });

    expect(outcome.status).toBe(400);
    expect(JSON.stringify(outcome.body)).toContain(EMBEDDING_MODEL);
  });

  it.each([
    ["fewer numbers than the model produces", { vector: [1, 2, 3] }],
    [
      "a vector full of zeros",
      { vector: new Array(EMBEDDING_DIMENSIONS).fill(0) },
    ],
    [
      "something that is not a number",
      { vector: unitVector().map((value, i) => (i === 5 ? "x" : value)) },
    ],
    ["a missing vector", {}],
  ])("refuses %s", async (_, fields) => {
    const db = untouchedDb();

    const outcome = await handleSearchRequest(db, {
      model: EMBEDDING_MODEL,
      ...fields,
    });

    expect(outcome.status).toBe(400);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it("refuses a body that is not an object", async () => {
    expect((await handleSearchRequest(untouchedDb(), null)).status).toBe(400);
    expect((await handleSearchRequest(untouchedDb(), "texto")).status).toBe(
      400,
    );
  });

  it("answers 500 without leaking the database error", async () => {
    const db = {
      $queryRaw: vi.fn(async () => {
        throw new Error("connection to 10.0.0.5 refused");
      }),
    } as unknown as PrismaClient;

    const outcome = await handleSearchRequest(db, {
      model: EMBEDDING_MODEL,
      vector: unitVector(),
    });

    expect(outcome).toEqual({ status: 500, body: { error: "search failed" } });
  });
});
