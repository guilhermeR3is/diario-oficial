import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { z } from "zod";

export function parseJsonl<T>(raw: string, schema: z.ZodType<T>): T[] {
  const records: T[] = [];

  raw.split("\n").forEach((line, index) => {
    if (line.trim() === "") return;
    const lineNumber = index + 1;

    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      throw new Error(`linha ${lineNumber}: JSON inválido`);
    }

    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map(
          (issue) => `${issue.path.join(".") || "(linha)"}: ${issue.message}`,
        )
        .join("; ");
      throw new Error(`linha ${lineNumber}: ${issues}`);
    }
    records.push(parsed.data);
  });

  return records;
}

export async function readJsonl<T>(
  path: string,
  schema: z.ZodType<T>,
): Promise<T[]> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return parseJsonl(raw, schema);
}

export async function appendJsonl(
  path: string,
  record: unknown,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(record)}\n`);
}
