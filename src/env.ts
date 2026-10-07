import { z } from "zod";

const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    LIVE_MODE: z.enum(["on", "off"]).default("off"),
    // vazio vale como ausente: quem copia o .env.example sem preencher não derruba o app com LIVE_MODE=off
    GROQ_API_KEY: z
      .string()
      .optional()
      .transform((value) => value?.trim() || undefined),
    GENERATION_MODEL: z.string().min(1).default("openai/gpt-oss-120b"),
    FIDELITY_MODEL: z.string().min(1).default("qwen/qwen3.8-27b"),
    VERCEL_GIT_COMMIT_SHA: z.string().optional(),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
  })
  .refine((env) => env.LIVE_MODE === "off" || env.GROQ_API_KEY !== undefined, {
    path: ["GROQ_API_KEY"],
    message: "is required when LIVE_MODE is on",
  });

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment variables: ${problems}`);
  }
  return result.data;
}

export const env = parseEnv(process.env);
