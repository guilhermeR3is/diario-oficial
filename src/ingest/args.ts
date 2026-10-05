import { parseArgs } from "node:util";
import { z } from "zod";

const argsSchema = z
  .object({ from: z.iso.date(), to: z.iso.date(), force: z.boolean() })
  .refine((args) => args.from <= args.to, {
    message: "--from must not be after --to",
    path: ["from"],
  });

export function parseIngestArgs(argv: string[]) {
  const { values } = parseArgs({
    args: argv,
    options: {
      from: { type: "string" },
      to: { type: "string" },
      force: { type: "boolean", default: false },
    },
  });

  const result = argsSchema.safeParse(values);
  if (!result.success) {
    throw new Error(`Invalid arguments: ${z.prettifyError(result.error)}`);
  }
  const { from, to, force } = result.data;
  return { range: { from, to }, force };
}
