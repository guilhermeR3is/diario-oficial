import { parseArgs } from "node:util";
import { z } from "zod";

const argsSchema = z.object({
  force: z.boolean(),
  limit: z.coerce.number().int().positive().optional(),
});

export function parseEmbedArgs(argv: string[]) {
  const { values } = parseArgs({
    args: argv,
    options: {
      force: { type: "boolean", default: false },
      limit: { type: "string" },
    },
  });

  const result = argsSchema.safeParse(values);
  if (!result.success) {
    throw new Error(`Invalid arguments: ${z.prettifyError(result.error)}`);
  }
  return result.data;
}
