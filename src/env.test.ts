import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const validSource = { DATABASE_URL: "postgresql://localhost:5432/diario" };

describe("parseEnv", () => {
  it("applies defaults for optional variables", () => {
    const env = parseEnv(validSource);

    expect(env.LIVE_MODE).toBe("off");
    expect(env.LOG_LEVEL).toBe("info");
  });

  it("keeps values that were provided", () => {
    const env = parseEnv({
      ...validSource,
      LIVE_MODE: "on",
      LOG_LEVEL: "debug",
    });

    expect(env.LIVE_MODE).toBe("on");
    expect(env.LOG_LEVEL).toBe("debug");
  });

  it("fails when DATABASE_URL is missing and names the variable", () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });

  it("fails when LIVE_MODE is not on or off", () => {
    expect(() => parseEnv({ ...validSource, LIVE_MODE: "maybe" })).toThrow(
      /LIVE_MODE/,
    );
  });
});
