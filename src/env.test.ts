import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const validSource = { DATABASE_URL: "postgresql://localhost:5432/diario" };

const liveSource = {
  ...validSource,
  LIVE_MODE: "on",
  GROQ_API_KEY: "chave-de-teste",
  VISITOR_HASH_SECRET: "segredo-de-teste-".repeat(2),
};

describe("parseEnv", () => {
  it("applies defaults for optional variables", () => {
    const env = parseEnv(validSource);

    expect(env.LIVE_MODE).toBe("off");
    expect(env.LOG_LEVEL).toBe("info");
  });

  it("keeps values that were provided", () => {
    const env = parseEnv({
      ...liveSource,
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

  it("uses qwen3.8 on Groq as the faithfulness verifier unless another is chosen", () => {
    expect(parseEnv(validSource).FIDELITY_MODEL).toBe("qwen/qwen3.8-27b");
    expect(
      parseEnv({ ...validSource, FIDELITY_MODEL: "outro/verificador" })
        .FIDELITY_MODEL,
    ).toBe("outro/verificador");
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
      expect(() => parseEnv({ ...liveSource, GROQ_API_KEY: key })).toThrow(
        /GROQ_API_KEY: is required when LIVE_MODE is on/,
      );
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
  it("allows 30 live questions a day for the site and 5 per visitor unless told otherwise", () => {
    const env = parseEnv(validSource);

    expect(env.LIVE_DAILY_LIMIT).toBe(30);
    expect(env.VISITOR_DAILY_LIMIT).toBe(5);
    expect(
      parseEnv({
        ...validSource,
        LIVE_DAILY_LIMIT: "12",
        VISITOR_DAILY_LIMIT: "2",
      }),
    ).toMatchObject({ LIVE_DAILY_LIMIT: 12, VISITOR_DAILY_LIMIT: 2 });
  });

  it.each(["0", "-1", "2.5", "trinta"])(
    "refuses a daily limit that is not a positive whole number (%j)",
    (limit) => {
      expect(() =>
        parseEnv({ ...validSource, LIVE_DAILY_LIMIT: limit }),
      ).toThrow(/LIVE_DAILY_LIMIT/);
      expect(() =>
        parseEnv({ ...validSource, VISITOR_DAILY_LIMIT: limit }),
      ).toThrow(/VISITOR_DAILY_LIMIT/);
    },
  );

  it.each([undefined, "", "   "])(
    "fails when live mode is on and the visitor hash secret is missing (%j)",
    (secret) => {
      expect(() =>
        parseEnv({ ...liveSource, VISITOR_HASH_SECRET: secret }),
      ).toThrow(/VISITOR_HASH_SECRET: is required when LIVE_MODE is on/);
    },
  );

  it("refuses a visitor hash secret shorter than 32 characters", () => {
    expect(() =>
      parseEnv({ ...liveSource, VISITOR_HASH_SECRET: "curto-demais" }),
    ).toThrow(/VISITOR_HASH_SECRET/);
    expect(
      parseEnv({ ...liveSource, VISITOR_HASH_SECRET: "x".repeat(32) })
        .VISITOR_HASH_SECRET,
    ).toHaveLength(32);
  });
});
