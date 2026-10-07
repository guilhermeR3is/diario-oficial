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
      GROQ_API_KEY: "chave-de-teste",
      GENERATION_MODEL: "outro/modelo",
      LOG_LEVEL: "debug",
    });

    expect(env.LIVE_MODE).toBe("on");
    expect(env.GROQ_API_KEY).toBe("chave-de-teste");
    expect(env.GENERATION_MODEL).toBe("outro/modelo");
    expect(env.LOG_LEVEL).toBe("debug");
  });

  it("uses gpt-oss-120b on Groq when no generation model is chosen", () => {
    expect(parseEnv(validSource).GENERATION_MODEL).toBe("openai/gpt-oss-120b");
  });

  it("does not need the Groq key while live mode is off", () => {
    expect(parseEnv(validSource).GROQ_API_KEY).toBeUndefined();
  });

  it("treats an empty or blank key as missing, as left by a copied .env.example", () => {
    expect(parseEnv({ ...validSource, GROQ_API_KEY: "" }).GROQ_API_KEY).toBe(
      undefined,
    );
    expect(parseEnv({ ...validSource, GROQ_API_KEY: "  " }).GROQ_API_KEY).toBe(
      undefined,
    );
  });

  it("trims the key", () => {
    const env = parseEnv({ ...validSource, GROQ_API_KEY: " chave-de-teste\n" });

    expect(env.GROQ_API_KEY).toBe("chave-de-teste");
  });

  it.each([undefined, "", "   "])(
    "fails when live mode is on and the Groq key is missing (%j)",
    (key) => {
      expect(() =>
        parseEnv({ ...validSource, LIVE_MODE: "on", GROQ_API_KEY: key }),
      ).toThrow(/GROQ_API_KEY: is required when LIVE_MODE is on/);
    },
  );

  it("fails when DATABASE_URL is missing and names the variable", () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });

  it("fails when LIVE_MODE is not on or off", () => {
    expect(() => parseEnv({ ...validSource, LIVE_MODE: "maybe" })).toThrow(
      /LIVE_MODE/,
    );
  });
});
