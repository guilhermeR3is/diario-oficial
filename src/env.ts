import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  LIVE_MODE: z.enum(["on", "off"]).default("off"),
  VERCEL_GIT_COMMIT_SHA: z.string().optional(),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
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
